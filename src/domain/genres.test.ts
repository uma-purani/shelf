import { describe, expect, it } from 'vitest'
import { genresFromSubjects, genresFromTmdbIds, normalizeGenre, normalizeGenres } from './genres'

describe('normalizeGenre', () => {
  it('uses the standard spelling for known genres, whatever the case or spacing', () => {
    expect(normalizeGenre('science fiction')).toBe('Science Fiction')
    expect(normalizeGenre('  SCIENCE   FICTION ')).toBe('Science Fiction')
    expect(normalizeGenre('sELF-hELP')).toBe('Self-Help')
  })
  it('capitalises words of anything else and drops blanks', () => {
    expect(normalizeGenre('cozy mystery')).toBe('Cozy Mystery')
    expect(normalizeGenre('   ')).toBe('')
    expect(normalizeGenre('x'.repeat(100))).toHaveLength(40)
  })
})

describe('normalizeGenres', () => {
  it('removes duplicates ignoring case, keeps order, and caps the list', () => {
    expect(normalizeGenres(['fantasy', 'Fantasy', ' Mystery ', '', 'FANTASY'])).toEqual(['Fantasy', 'Mystery'])
    expect(normalizeGenres(Array.from({ length: 20 }, (_, i) => `g${i}`))).toHaveLength(8)
    expect(normalizeGenres(undefined)).toEqual([])
  })
})

describe('genresFromTmdbIds', () => {
  it('maps TMDB ids to genre names', () => {
    expect(genresFromTmdbIds([878, 18])).toEqual(['Science Fiction', 'Drama'])
  })
  it('expands TV combo genres, drops duplicates and ignores unknown ids', () => {
    expect(genresFromTmdbIds([10759, 28])).toEqual(['Action', 'Adventure'])
    expect(genresFromTmdbIds([10765])).toEqual(['Science Fiction', 'Fantasy'])
    expect(genresFromTmdbIds([999999, 35])).toEqual(['Comedy'])
    expect(genresFromTmdbIds(undefined)).toEqual([])
    expect(genresFromTmdbIds([])).toEqual([])
  })
})

describe('genresFromSubjects', () => {
  it('maps real-looking subject lists to a few broad genres, most specific first', () => {
    const dune = ['Fiction', 'Science fiction', 'Dune (Imaginary place)', 'Life on other planets', 'Fantasy fiction', 'Ecology']
    expect(genresFromSubjects(dune)).toEqual(['Science Fiction', 'Fantasy'])
    expect(genresFromSubjects(['Fantasy fiction', 'Labyrinths', 'Magic', 'Fiction in English'])).toEqual(['Fantasy'])
    expect(genresFromSubjects(['Detective and mystery stories', 'Murder', 'Fiction'])).toEqual(['Mystery', 'Crime'])
    expect(genresFromSubjects(["Biography", "Presidents"])).toEqual(['Biography'])
  })
  it('caps at three genres', () => {
    const s = ['Science fiction', 'Fantasy', 'Mystery', 'Thriller', 'Horror']
    expect(genresFromSubjects(s)).toHaveLength(3)
    expect(genresFromSubjects(s, 5)).toHaveLength(5)
  })
  it('falls back to Fiction, and to nothing when there is nothing to go on', () => {
    expect(genresFromSubjects(['Fiction', 'Family life'])).toEqual(['Fiction'])
    expect(genresFromSubjects(['Houses', 'Gardens'])).toEqual([])
    expect(genresFromSubjects([])).toEqual([])
    expect(genresFromSubjects(undefined)).toEqual([])
  })
  it('does not mistake "historical" fiction for history or crime words inside other words', () => {
    expect(genresFromSubjects(['Historical fiction'])).toEqual(['Historical Fiction'])
    expect(genresFromSubjects(['Criminal law'])).toEqual([]) // "criminal" is not the Crime genre
  })
})
