import { describe, expect, it } from 'vitest'
import { createItem } from './items'
import { createQuote, editQuote, searchQuotes } from './quotes'
import type { Quote } from './types'

const t0 = new Date(2026, 9, 1, 12)

describe('createQuote', () => {
  it('requires text and trims it; location is optional', () => {
    expect(() => createQuote({ itemId: 'i', text: '   ' }, t0, 'q')).toThrow()
    const q = createQuote({ itemId: 'i', text: '  Fear is the mind-killer.  ', location: '  p. 8 ' }, t0, 'q1')
    expect(q).toMatchObject({ id: 'q1', itemId: 'i', text: 'Fear is the mind-killer.', location: 'p. 8' })
    expect('location' in createQuote({ itemId: 'i', text: 'x', location: ' ' }, t0, 'q2')).toBe(false)
  })
})

describe('editQuote', () => {
  const base: Quote = { id: 'q', itemId: 'i', text: 'old', location: 'p. 1', createdAt: t0.toISOString() }
  it('updates text and location without mutating', () => {
    const next = editQuote(base, { text: ' new ', location: 'ch. 2' })
    expect(next).toMatchObject({ text: 'new', location: 'ch. 2' })
    expect(base.text).toBe('old')
  })
  it('clears the location when blank but never allows blank text', () => {
    expect('location' in editQuote(base, { location: '' })).toBe(false)
    expect(() => editQuote(base, { text: '  ' })).toThrow()
    expect(editQuote(base, {}).text).toBe('old')
  })
})

describe('searchQuotes', () => {
  const dune = createItem({ type: 'book', title: 'Dune', creator: 'Frank Herbert' }, t0, 'dune')
  const heat = createItem({ type: 'movie', title: 'Heat' }, t0, 'heat')
  const q = (id: string, itemId: string, text: string, createdAt: string, location?: string): Quote => ({
    id,
    itemId,
    text,
    createdAt,
    ...(location ? { location } : {}),
  })
  const quotes = [
    q('1', 'dune', 'Fear is the mind-killer.', '2026-10-01T00:00:00.000Z', 'p. 8'),
    q('2', 'heat', 'Don’t let yourself get attached.', '2026-10-03T00:00:00.000Z', '0:42:10'),
    q('3', 'dune', 'The spice must flow.', '2026-10-02T00:00:00.000Z'),
    q('4', 'gone', 'orphaned', '2026-10-04T00:00:00.000Z'),
  ]
  const ids = (query: string) => searchQuotes(quotes, [dune, heat], query).map((r) => r.quote.id)

  it('returns everything newest first for a blank query, skipping orphans', () => {
    expect(ids('')).toEqual(['2', '3', '1'])
    expect(ids('   ')).toEqual(['2', '3', '1'])
  })
  it('matches quote text, case-insensitively', () => {
    expect(ids('SPICE')).toEqual(['3'])
  })
  it('matches location, item title and creator', () => {
    expect(ids('p. 8')).toEqual(['1'])
    expect(ids('heat')).toEqual(['2'])
    expect(ids('herbert')).toEqual(['3', '1'])
  })
  it('requires every word to match, across fields', () => {
    expect(ids('dune spice')).toEqual(['3'])
    expect(ids('dune attached')).toEqual([])
  })
  it('attaches the item to each result', () => {
    expect(searchQuotes(quotes, [dune, heat], 'spice')[0].item.title).toBe('Dune')
  })
})
