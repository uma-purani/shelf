import { describe, expect, it } from 'vitest'
import { mapOpenLibrary, mapOpenLibraryIsbn, mapTmdb } from './mappers'

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

describe('mapOpenLibraryIsbn', () => {
  const isbn = '9780441172719'
  const response = {
    [`ISBN:${isbn}`]: {
      details: {
        title: 'Dune',
        authors: [{ name: 'Frank Herbert' }, { name: 'B' }, { name: 'C' }],
        publish_date: 'August 2, 2005',
        covers: [8231856],
        works: [{ key: '/works/OL893415W' }],
      },
    },
  }
  it('maps an edition to a book match, using the work key as externalId', () => {
    expect(mapOpenLibraryIsbn(response, isbn)).toEqual({
      isbn,
      title: 'Dune',
      creator: 'Frank Herbert, B',
      year: 2005,
      coverUrl: 'https://covers.openlibrary.org/b/id/8231856-M.jpg',
      externalId: '/works/OL893415W',
    })
  })
  it('returns null for an unknown ISBN, a missing title, or bad input', () => {
    expect(mapOpenLibraryIsbn({}, isbn)).toBeNull()
    expect(mapOpenLibraryIsbn({ [`ISBN:${isbn}`]: { details: { title: '  ' } } }, isbn)).toBeNull()
    expect(mapOpenLibraryIsbn({ [`ISBN:${isbn}`]: {} }, isbn)).toBeNull()
    expect(mapOpenLibraryIsbn(null, isbn)).toBeNull()
    expect(mapOpenLibraryIsbn(response, '9780000000002')).toBeNull() // answer is for a different ISBN
  })
  it('copes with missing optional fields', () => {
    const m = mapOpenLibraryIsbn({ [`ISBN:${isbn}`]: { details: { title: 'X', publish_date: 'n.d.' } } }, isbn)
    expect(m).toEqual({ isbn, title: 'X', creator: undefined, year: undefined, coverUrl: undefined, externalId: undefined })
  })
})

describe('genres from metadata', () => {
  it('maps Open Library search subjects to broad genres', () => {
    const [r] = mapOpenLibrary({
      docs: [{ key: '/works/OL1W', title: 'Dune', subject: ['Fiction', 'Science fiction', 'Fantasy fiction', 'Ecology'] }],
    })
    expect(r.genres).toEqual(['Science Fiction', 'Fantasy'])
  })
  it('leaves genres off when a book has no usable subjects', () => {
    const [r] = mapOpenLibrary({ docs: [{ key: '/works/OL2W', title: 'Untitled', subject: ['Houses'] }] })
    expect('genres' in r && r.genres !== undefined).toBe(false)
  })
  it('maps TMDB genre ids for movies and shows', () => {
    const out = mapTmdb({
      results: [
        { id: 1, media_type: 'movie', title: 'Dune', genre_ids: [878, 12] },
        { id: 2, media_type: 'tv', name: 'Severance', genre_ids: [10765, 18] },
        { id: 3, media_type: 'tv', name: 'No genres', genre_ids: [] },
      ],
    })
    expect(out[0].genres).toEqual(['Science Fiction', 'Adventure'])
    expect(out[1].genres).toEqual(['Science Fiction', 'Fantasy', 'Drama'])
    expect(out[2].genres).toBeUndefined()
  })
  it('maps subjects on an ISBN lookup, whether strings or objects', () => {
    const isbn = '9780441172719'
    const withStrings = { [`ISBN:${isbn}`]: { details: { title: 'Dune', subjects: ['Science fiction', 'Fiction'] } } }
    const withObjects = { [`ISBN:${isbn}`]: { details: { title: 'Dune', subjects: [{ name: 'Science fiction' }, { name: 'Fantasy' }] } } }
    expect(mapOpenLibraryIsbn(withStrings, isbn)?.genres).toEqual(['Science Fiction'])
    expect(mapOpenLibraryIsbn(withObjects, isbn)?.genres).toEqual(['Science Fiction', 'Fantasy'])
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
