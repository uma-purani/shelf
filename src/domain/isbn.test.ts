import { describe, expect, it } from 'vitest'
import { isbn10To13, isValidIsbn10, isValidIsbn13, looksLikeIsbn, normalizeIsbn } from './isbn'

describe('checksums', () => {
  it('accepts valid ISBN-13 and rejects a wrong check digit or prefix', () => {
    expect(isValidIsbn13('9780441172719')).toBe(true)
    expect(isValidIsbn13('9780441172718')).toBe(false)
    expect(isValidIsbn13('9790000000000')).toBe(false) // checksum
    expect(isValidIsbn13('5012345678900')).toBe(false) // valid EAN, not a book prefix
    expect(isValidIsbn13('978044117271')).toBe(false) // too short
  })
  it('accepts valid ISBN-10 including a trailing X', () => {
    expect(isValidIsbn10('0441172717')).toBe(true)
    expect(isValidIsbn10('080442957X')).toBe(true)
    expect(isValidIsbn10('0441172716')).toBe(false)
    expect(isValidIsbn10('X441172717')).toBe(false)
  })
  it('converts ISBN-10 to ISBN-13', () => {
    expect(isbn10To13('0441172717')).toBe('9780441172719')
    expect(isValidIsbn13(isbn10To13('080442957X'))).toBe(true)
  })
})

describe('normalizeIsbn', () => {
  it('returns the ISBN-13 for either form, with hyphens or spaces', () => {
    expect(normalizeIsbn('9780441172719')).toBe('9780441172719')
    expect(normalizeIsbn('978-0-441-17271-9')).toBe('9780441172719')
    expect(normalizeIsbn(' 0441172717 ')).toBe('9780441172719')
    expect(normalizeIsbn('0-441-17271-7')).toBe('9780441172719')
    expect(normalizeIsbn('0-8044-2957-x')).toBe(isbn10To13('080442957X'))
  })
  it('rejects anything that is not a valid ISBN', () => {
    for (const bad of ['', 'abc', '123', '9780441172718', '12345', '0441172716', '97804411727190', '51234']) {
      expect(normalizeIsbn(bad)).toBeUndefined()
    }
  })
})

describe('looksLikeIsbn', () => {
  it('detects ISBN-shaped queries but not titles', () => {
    expect(looksLikeIsbn('9780441172719')).toBe(true)
    expect(looksLikeIsbn('978-0-441-17271-9')).toBe(true)
    expect(looksLikeIsbn('080442957X')).toBe(true)
    expect(looksLikeIsbn('dune')).toBe(false)
    expect(looksLikeIsbn('1984')).toBe(false)
    expect(looksLikeIsbn('')).toBe(false)
  })
})
