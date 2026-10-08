import { describe, expect, it } from 'vitest'
import { averageRating, formatRating, isValidRating, ratingFromTap, starFills } from './rating'

describe('ratingFromTap', () => {
  it('left half of a star gives a half rating', () => {
    expect(ratingFromTap(4, 0)).toBe(3.5)
    expect(ratingFromTap(4, 0.49)).toBe(3.5)
    expect(ratingFromTap(1, 0.2)).toBe(0.5)
  })
  it('right half gives a full rating', () => {
    expect(ratingFromTap(4, 0.5)).toBe(4)
    expect(ratingFromTap(4, 1)).toBe(4)
    expect(ratingFromTap(5, 0.9)).toBe(5)
  })
  it('rejects invalid stars', () => {
    expect(() => ratingFromTap(0, 0.5)).toThrow()
    expect(() => ratingFromTap(6, 0.5)).toThrow()
    expect(() => ratingFromTap(2.5, 0.5)).toThrow()
  })
})

describe('isValidRating', () => {
  it('accepts 0.5 steps from 0.5 to 5', () => {
    for (const r of [0.5, 1, 2.5, 4.5, 5]) expect(isValidRating(r)).toBe(true)
  })
  it('rejects everything else', () => {
    for (const r of [0, -1, 5.5, 3.3, 0.25, NaN, Infinity, '3', undefined, null]) {
      expect(isValidRating(r)).toBe(false)
    }
  })
})

describe('starFills', () => {
  it('renders half and full stars', () => {
    expect(starFills(3.5)).toEqual(['full', 'full', 'full', 'half', 'empty'])
    expect(starFills(5)).toEqual(['full', 'full', 'full', 'full', 'full'])
    expect(starFills(0.5)).toEqual(['half', 'empty', 'empty', 'empty', 'empty'])
    expect(starFills(undefined)).toEqual(['empty', 'empty', 'empty', 'empty', 'empty'])
  })
})

describe('formatRating', () => {
  it('drops the decimal on whole numbers', () => {
    expect(formatRating(4)).toBe('4')
    expect(formatRating(3.5)).toBe('3.5')
  })
})

describe('averageRating', () => {
  it('averages defined ratings only', () => {
    expect(averageRating([4, 5, undefined, 3.5])).toBe(4.17)
  })
  it('is undefined with no ratings', () => {
    expect(averageRating([])).toBeUndefined()
    expect(averageRating([undefined])).toBeUndefined()
  })
})
