import { describe, expect, it } from 'vitest'
import { mapOpenLibrary, mapTmdb } from './mappers'

describe('mapOpenLibrary', () => {
  it('maps docs to book results', () => {
    const [r] = mapOpenLibrary({
      docs: [
        {
          key: '/works/OL893415W',
          title: 'Dune',
          author_name: ['Frank Herbert', 'Someone Else', 'Third'],
          first_publish_year: 1965,
          cover_i: 123,
          isbn: ['0441172717', '9780441172719'],
        },
      ],
    })
    expect(r).toMatchObject({
      type: 'book',
      title: 'Dune',
      creator: 'Frank Herbert, Someone Else',
      year: 1965,
      isbn: '9780441172719',
      externalId: '/works/OL893415W',
      coverUrl: 'https://covers.openlibrary.org/b/id/123-M.jpg',
    })
  })
  it('skips docs without key or title, and tolerates bad input', () => {
    expect(mapOpenLibrary({ docs: [{ title: 'x' }, { key: '/works/1' }] })).toEqual([])
    expect(mapOpenLibrary(null)).toEqual([])
    expect(mapOpenLibrary({})).toEqual([])
  })
})

describe('mapTmdb', () => {
  it('maps movies and shows, drops people and untitled entries', () => {
    const out = mapTmdb({
      results: [
        { id: 1, media_type: 'movie', title: 'Dune', release_date: '2021-09-15', poster_path: '/p.jpg' },
        { id: 2, media_type: 'tv', name: 'Severance', first_air_date: '2022-02-17', poster_path: null },
        { id: 3, media_type: 'person', name: 'Someone' },
        { id: 4, media_type: 'movie' },
      ],
    })
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({
      type: 'movie',
      title: 'Dune',
      year: 2021,
      externalId: 'movie:1',
      coverUrl: 'https://image.tmdb.org/t/p/w185/p.jpg',
    })
    expect(out[1]).toMatchObject({ type: 'show', title: 'Severance', year: 2022, externalId: 'tv:2' })
    expect(out[1].coverUrl).toBeUndefined()
  })
  it('handles missing dates and bad input', () => {
    expect(mapTmdb({ results: [{ id: 9, media_type: 'tv', name: 'X', first_air_date: '' }] })[0].year).toBeUndefined()
    expect(mapTmdb(undefined)).toEqual([])
  })
})
