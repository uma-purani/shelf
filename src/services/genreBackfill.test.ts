import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ShelfDB } from '../data/db'
import { createRepo, type Repo } from '../data/repo'
import type { Item } from '../domain/types'
import { createGenreBackfill, genreTarget, genresFromResponse, HttpError, type FetchJson } from './genreBackfill'

const item = (over: Partial<Item> & { id: string }): Item => ({
  type: 'book',
  title: over.id,
  status: 'want',
  isDraft: false,
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

describe('genreTarget / genresFromResponse', () => {
  it('works out where to look from the external id', () => {
    expect(genreTarget(item({ id: 'a', externalId: 'movie:438631' }))).toEqual({ source: 'tmdb', url: '/api/tmdb?path=movie/438631' })
    expect(genreTarget(item({ id: 'a', externalId: 'tv:95396' }))).toEqual({ source: 'tmdb', url: '/api/tmdb?path=tv/95396' })
    expect(genreTarget(item({ id: 'a', externalId: '/works/OL893415W' }))).toEqual({
      source: 'openlibrary',
      url: 'https://openlibrary.org/works/OL893415W.json',
    })
    expect(genreTarget(item({ id: 'a' }))).toBeNull() // added by hand
    expect(genreTarget(item({ id: 'a', externalId: 'something-else' }))).toBeNull()
  })

  it('reads genres from a TMDB detail and an Open Library work', () => {
    const tmdb = { source: 'tmdb', url: '' } as const
    expect(genresFromResponse(tmdb, { genres: [{ id: 878, name: 'Science Fiction' }, { id: 12 }] })).toEqual(['Science Fiction', 'Adventure'])
    expect(genresFromResponse(tmdb, {})).toEqual([])
    const ol = { source: 'openlibrary', url: '' } as const
    expect(genresFromResponse(ol, { subjects: ['Fantasy fiction', 'Labyrinths', 42, null] })).toEqual(['Fantasy'])
    expect(genresFromResponse(ol, { subjects: 'nope' })).toEqual([])
  })
})

describe('genre backfill', () => {
  let db: ShelfDB
  let repo: Repo
  let getJson: ReturnType<typeof vi.fn<FetchJson>>
  const put = (i: Item) => db.items.put(i)

  const make = () => createGenreBackfill({ db, repo, getJson, clock: () => new Date(2026, 9, 11) })

  beforeEach(() => {
    db = new ShelfDB(`test-${Math.random()}`)
    repo = createRepo(db)
    getJson = vi.fn<FetchJson>()
  })

  it('surveys how many items lack genres and how many can be looked up', async () => {
    await put(item({ id: 'has', genres: ['Fantasy'], externalId: 'movie:1' }))
    await put(item({ id: 'can', externalId: 'movie:2' }))
    await put(item({ id: 'cannot' }))
    expect(await make().survey()).toEqual({ missing: 2, lookupable: 1 })
  })

  it('fills in genres for movies, shows and books and leaves other items alone', async () => {
    await put(item({ id: 'film', type: 'movie', externalId: 'movie:1' }))
    await put(item({ id: 'tv', type: 'show', externalId: 'tv:2' }))
    await put(item({ id: 'book', externalId: '/works/OL1W' }))
    await put(item({ id: 'hand' }))
    await put(item({ id: 'done', externalId: 'movie:9', genres: ['Drama'] }))
    getJson.mockImplementation(async (url) => {
      if (url.includes('movie/1')) return { genres: [{ id: 878 }] }
      if (url.includes('tv/2')) return { genres: [{ id: 10765 }] }
      return { subjects: ['Detective and mystery stories'] }
    })
    const progress: Array<[number, number]> = []
    const r = await make().run((d, t) => progress.push([d, t]))

    expect(r).toMatchObject({ updated: 3, noGenres: 0, failed: 0, stoppedEarly: false })
    expect((await db.items.get('film'))?.genres).toEqual(['Science Fiction'])
    expect((await db.items.get('tv'))?.genres).toEqual(['Science Fiction', 'Fantasy'])
    expect((await db.items.get('book'))?.genres).toEqual(['Mystery'])
    expect((await db.items.get('hand'))?.genres).toBeUndefined()
    expect((await db.items.get('done'))?.genres).toEqual(['Drama']) // already had genres: not touched
    expect(getJson).toHaveBeenCalledTimes(3)
    expect(progress.at(-1)).toEqual([3, 3])
  })

  it('treats a 404 or an empty answer as "no genres found", not as an error', async () => {
    await put(item({ id: 'gone', externalId: 'movie:1' }))
    await put(item({ id: 'empty', externalId: 'movie:2' }))
    getJson.mockImplementation(async (url) => {
      if (url.includes('movie/1')) throw new HttpError(404)
      return { genres: [] }
    })
    const r = await make().run()
    expect(r).toMatchObject({ updated: 0, noGenres: 2, failed: 0 })
  })

  it('stops after repeated network failures instead of trying everything', async () => {
    for (let i = 0; i < 8; i++) await put(item({ id: `m${i}`, externalId: `movie:${i}` }))
    getJson.mockRejectedValue(new Error('Failed to fetch'))
    const r = await make().run()
    expect(r.stoppedEarly).toBe(true)
    expect(r.failed).toBe(3)
    expect(getJson).toHaveBeenCalledTimes(3)
    expect(r.updated).toBe(0)
  })

  it('one failure in a while does not stop the run', async () => {
    await put(item({ id: 'a', externalId: 'movie:1' }))
    await put(item({ id: 'b', externalId: 'movie:2' }))
    await put(item({ id: 'c', externalId: 'movie:3' }))
    getJson.mockResolvedValueOnce({ genres: [{ id: 18 }] }).mockRejectedValueOnce(new Error('blip')).mockResolvedValueOnce({ genres: [{ id: 35 }] })
    const r = await make().run()
    expect(r).toMatchObject({ updated: 2, failed: 1, stoppedEarly: false })
  })

  it('undo puts every item back as it was', async () => {
    await put(item({ id: 'a', externalId: 'movie:1' }))
    await put(item({ id: 'b', externalId: 'movie:2' }))
    getJson.mockResolvedValue({ genres: [{ id: 18 }] })
    const r = await make().run()
    expect(r.updated).toBe(2)
    await r.undo()
    expect((await db.items.get('a'))?.genres).toBeUndefined()
    expect((await db.items.get('b'))?.genres).toBeUndefined()
    expect((await db.items.get('a'))?.updatedAt).toBe('2026-01-01T00:00:00.000Z')
  })
})
