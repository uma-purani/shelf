import { describe, expect, it } from 'vitest'
import { countFinishedInMonth, computeStats, monthlyHistory, statsBySource, yearlyHistory } from './stats'
import type { Item, ItemType, LogEntry, Status } from './types'

const item = (id: string, type: ItemType, status: Status = 'finished'): Item => ({
  id,
  type,
  title: id,
  status,
  isDraft: false,
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})
let n = 0
const log = (itemId: string, finishedAt?: string, rating?: number): LogEntry => ({
  id: `l${++n}`,
  itemId,
  finishedAt,
  rating,
  createdAt: '2026-01-01T00:00:00.000Z',
})

const now = new Date(2026, 9, 15) // 2026-10-15 local

describe('countFinishedInMonth', () => {
  it('counts only entries finished in the current month', () => {
    const logs = [log('a', '2026-10-01'), log('a', '2026-10-31'), log('a', '2026-09-30'), log('a', '2025-10-10'), log('a')]
    expect(countFinishedInMonth(logs, now)).toBe(2)
  })
})

describe('computeStats counts', () => {
  const items = [item('b1', 'book'), item('m1', 'movie'), item('s1', 'show')]

  it('splits finished counts by type for month, year and all time', () => {
    const logs = [
      log('b1', '2026-10-02', 4),
      log('m1', '2026-10-09', 3),
      log('s1', '2026-03-20', 5), // this year, not this month
      log('b1', '2025-12-31', 2), // last year
    ]
    const s = computeStats(items, logs, now)
    expect(s.thisMonth).toEqual({ book: 1, movie: 1, show: 0, total: 2 })
    expect(s.thisYear).toEqual({ book: 1, movie: 1, show: 1, total: 3 })
    expect(s.allTime).toEqual({ book: 2, movie: 1, show: 1, total: 4 })
  })

  it('counts a re-read or rewatch as another finish', () => {
    const logs = [log('b1', '2026-02-01', 4), log('b1', '2026-10-05', 5)]
    const s = computeStats(items, logs, now)
    expect(s.allTime.book).toBe(2)
    expect(s.thisYear.book).toBe(2)
    expect(s.thisMonth.book).toBe(1)
  })

  it('ignores unfinished and dropped runs and entries for deleted items', () => {
    const logs = [log('b1'), log('b1', undefined, undefined), log('ghost', '2026-10-01', 5)]
    const s = computeStats(items, logs, now)
    expect(s.allTime.total).toBe(0)
    expect(s.averageRating).toBeUndefined()
  })

  it('handles month and year boundaries', () => {
    const jan1 = new Date(2026, 0, 1)
    const logs = [log('b1', '2025-12-31', 3), log('b1', '2026-01-01', 4)]
    const s = computeStats(items, logs, jan1)
    expect(s.thisMonth.book).toBe(1)
    expect(s.thisYear.book).toBe(1)
    expect(s.allTime.book).toBe(2)
  })

  it('is all zeros for an empty library', () => {
    const s = computeStats([], [], now)
    expect(s.allTime).toEqual({ book: 0, movie: 0, show: 0, total: 0 })
    expect(s.library.total).toBe(0)
  })
})

describe('computeStats ratings', () => {
  const items = [item('b1', 'book'), item('m1', 'movie'), item('s1', 'show')]

  it('averages half-star ratings overall and per type', () => {
    const logs = [log('b1', '2026-10-01', 4.5), log('b1', '2026-10-02', 3.5), log('m1', '2026-10-03', 5)]
    const s = computeStats(items, logs, now)
    expect(s.averageRating).toBe(4.33)
    expect(s.averageRatingByType).toEqual({ book: 4, movie: 5 })
  })

  it('leaves out types with no rated finishes', () => {
    const s = computeStats(items, [log('s1', '2026-10-01')], now)
    expect(s.averageRatingByType).toEqual({})
  })
})

describe('statsBySource', () => {
  const rec = (id: string, type: ItemType, recommendedBy: string | undefined, status: Status = 'want'): Item => ({
    ...item(id, type, status),
    ...(recommendedBy !== undefined ? { recommendedBy } : {}),
  })

  it('groups by source ignoring case and spaces, with the most used spelling as the name', () => {
    const items = [rec('a', 'book', 'Sam'), rec('b', 'movie', ' sam '), rec('c', 'show', 'SAM'), rec('d', 'book', 'Sam'), rec('e', 'book', 'Podcast X')]
    const { sources } = statsBySource(items, [])
    expect(sources.map((s) => [s.name, s.recommended])).toEqual([['Sam', 4], ['Podcast X', 1]])
  })

  it('counts finished items once however often re-read, plus dropped and average rating', () => {
    const items = [rec('a', 'book', 'Sam', 'finished'), rec('b', 'show', 'Sam', 'dropped'), rec('c', 'movie', 'Sam', 'want')]
    const logs = [log('a', '2026-01-01', 4), log('a', '2026-06-01', 5), log('b'), log('c')] // a was read twice
    const [sam] = statsBySource(items, logs).sources
    expect(sam).toMatchObject({ recommended: 3, finished: 1, dropped: 1, averageRating: 4.5 })
  })

  it('has no average when nothing from a source is rated', () => {
    const [s] = statsBySource([rec('a', 'book', 'Amy', 'finished')], [log('a', '2026-01-01')]).sources
    expect(s.finished).toBe(1)
    expect(s.averageRating).toBeUndefined()
  })

  it('counts items without a source separately and ignores blank sources', () => {
    const r = statsBySource([rec('a', 'book', undefined), rec('b', 'book', '   '), rec('c', 'book', 'Sam')], [])
    expect(r.unattributed).toBe(2)
    expect(r.sources).toHaveLength(1)
  })

  it('sorts by how much they recommended, then by rating, then by name', () => {
    const items = [
      rec('a', 'book', 'Low', 'finished'), rec('b', 'book', 'High', 'finished'),
      rec('c', 'book', 'Many'), rec('d', 'book', 'Many'),
      rec('e', 'book', 'Beta', 'finished'), rec('f', 'book', 'Alpha', 'finished'),
    ]
    const logs = [log('a', '2026-01-01', 2), log('b', '2026-01-01', 5), log('e', '2026-01-01', 3), log('f', '2026-01-01', 3)]
    // Many recommended the most; then by rating (High 5, Alpha and Beta 3 tie -> by name, Low 2)
    expect(statsBySource(items, logs).sources.map((s) => s.name)).toEqual(['Many', 'High', 'Alpha', 'Beta', 'Low'])
  })
})

describe('monthlyHistory', () => {
  const items = [item('b1', 'book'), item('m1', 'movie'), item('s1', 'show')]

  it('covers the last 12 months ending with the current one, oldest first', () => {
    const h = monthlyHistory(items, [], now)
    expect(h).toHaveLength(12)
    expect(h[0]).toMatchObject({ key: '2025-11', label: 'Nov', year: 2025 })
    expect(h[11]).toMatchObject({ key: '2026-10', label: 'Oct', year: 2026 })
    expect(h.every((b) => b.total === 0)).toBe(true)
  })

  it('buckets finished runs by month and type, counting re-reads', () => {
    const logs = [
      log('b1', '2026-10-02', 4),
      log('b1', '2026-10-20', 5), // re-read, same month
      log('m1', '2026-09-30', 3),
      log('s1', '2025-11-01', 5), // oldest month in range
      log('s1', '2025-10-31', 5), // just outside the range
    ]
    const byKey = Object.fromEntries(monthlyHistory(items, logs, now).map((b) => [b.key, b]))
    expect(byKey['2026-10']).toMatchObject({ book: 2, movie: 0, show: 0, total: 2 })
    expect(byKey['2026-09']).toMatchObject({ movie: 1, total: 1 })
    expect(byKey['2025-11']).toMatchObject({ show: 1, total: 1 })
    expect(byKey['2025-10']).toBeUndefined()
  })

  it('handles the year boundary and ignores unfinished runs and deleted items', () => {
    const jan = new Date(2026, 0, 15)
    const h = monthlyHistory(items, [log('b1', '2025-12-31'), log('b1'), log('ghost', '2026-01-02')], jan)
    expect(h[0].key).toBe('2025-02')
    expect(h[10]).toMatchObject({ key: '2025-12', book: 1, total: 1 }) // Dec 31 belongs to December
    expect(h[11]).toMatchObject({ key: '2026-01', total: 0 }) // the deleted item's Jan 2 finish is ignored
    expect(h.reduce((n, b) => n + b.total, 0)).toBe(1) // the unfinished run counts for nothing
  })

  it('supports a different window length', () => {
    expect(monthlyHistory(items, [], now, 3).map((b) => b.key)).toEqual(['2026-08', '2026-09', '2026-10'])
  })
})

describe('yearlyHistory', () => {
  const items = [item('b1', 'book'), item('m1', 'movie')]

  it('is empty before anything is finished', () => {
    expect(yearlyHistory(items, [], now)).toEqual([])
    expect(yearlyHistory(items, [log('b1')], now)).toEqual([])
  })

  it('runs from the first finished year to this year with no gaps', () => {
    const logs = [log('b1', '2023-05-01', 4), log('m1', '2023-06-01', 4), log('b1', '2026-02-01', 5)]
    const h = yearlyHistory(items, logs, now)
    expect(h.map((b) => [b.label, b.total])).toEqual([['2023', 2], ['2024', 0], ['2025', 0], ['2026', 1]])
    expect(h[0]).toMatchObject({ book: 1, movie: 1, show: 0 })
  })

  it('includes the current year even when nothing is finished in it yet', () => {
    const h = yearlyHistory(items, [log('b1', '2025-03-01', 4)], now)
    expect(h.map((b) => b.label)).toEqual(['2025', '2026'])
    expect(h[1].total).toBe(0)
  })
})

describe('computeStats library', () => {
  it('counts items by status once each', () => {
    const items = [item('a', 'book', 'want'), item('b', 'book', 'in_progress'), item('c', 'show', 'finished'), item('d', 'movie', 'dropped'), item('e', 'movie', 'want')]
    const s = computeStats(items, [log('c', '2026-01-01', 4), log('c', '2026-05-01', 5)], now)
    expect(s.library).toEqual({ want: 2, in_progress: 1, finished: 1, dropped: 1, total: 5 })
  })
})
