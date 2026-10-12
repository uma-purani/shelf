import { describe, expect, it } from 'vitest'
import { bumpOptions, bumpProgress } from './bump'

describe('bumpProgress: episodes and seasons', () => {
  it('adds one episode', () => {
    expect(bumpProgress('episode', 'S2E4')).toBe('S2E5')
    expect(bumpProgress('episode', 'S1E9')).toBe('S1E10')
    expect(bumpProgress('episode', 's2e4')).toBe('S2E5')
    expect(bumpProgress('episode', 'S2 E4')).toBe('S2E5')
    expect(bumpProgress('episode', ' S2E4 ')).toBe('S2E5')
  })
  it('keeps zero padding', () => {
    expect(bumpProgress('episode', 'S02E04')).toBe('S02E05')
    expect(bumpProgress('episode', 'S02E09')).toBe('S02E10')
    expect(bumpProgress('season', 'S02E04')).toBe('S03E01')
  })
  it('goes to the first episode of the next season', () => {
    expect(bumpProgress('season', 'S2E4')).toBe('S3E1')
    expect(bumpProgress('season', 'S9E12')).toBe('S10E1')
  })
  it('starts from S1E1 when nothing is recorded', () => {
    expect(bumpProgress('episode', undefined)).toBe('S1E1')
    expect(bumpProgress('season', '')).toBe('S1E1')
    expect(bumpProgress('episode', '   ')).toBe('S1E1')
  })
  it('refuses free text instead of overwriting it', () => {
    expect(bumpProgress('episode', 'halfway through')).toBeUndefined()
    expect(bumpProgress('season', 'S2')).toBeUndefined()
    expect(bumpProgress('episode', 'Episode 4')).toBeUndefined()
  })
})

describe('bumpProgress: pages', () => {
  it('adds ten pages and normalises the format', () => {
    expect(bumpProgress('pages', 'p. 142')).toBe('p. 152')
    expect(bumpProgress('pages', 'p.7')).toBe('p. 17')
    expect(bumpProgress('pages', '142')).toBe('p. 152')
    expect(bumpProgress('pages', 'page 99')).toBe('p. 109')
    expect(bumpProgress('pages', 'Pages 5')).toBe('p. 15')
  })
  it('starts at p. 10 when nothing is recorded', () => {
    expect(bumpProgress('pages', undefined)).toBe('p. 10')
  })
  it('refuses text it cannot read', () => {
    expect(bumpProgress('pages', 'ch. 3')).toBeUndefined()
    expect(bumpProgress('pages', 'p. 142 of 300')).toBeUndefined()
  })
})

describe('bumpOptions', () => {
  it('offers episode and season for shows, pages for books, nothing for movies', () => {
    expect(bumpOptions('show').map((o) => o.kind)).toEqual(['episode', 'season'])
    expect(bumpOptions('book').map((o) => o.kind)).toEqual(['pages'])
    expect(bumpOptions('movie')).toEqual([])
  })
})
