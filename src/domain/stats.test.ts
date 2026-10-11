import { describe, expect, it } from 'vitest'
import { countFinishedInMonth, computeStats } from './stats'
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

describe('computeStats library', () => {
  it('counts items by status once each', () => {
    const items = [item('a', 'book', 'want'), item('b', 'book', 'in_progress'), item('c', 'show', 'finished'), item('d', 'movie', 'dropped'), item('e', 'movie', 'want')]
    const s = computeStats(items, [log('c', '2026-01-01', 4), log('c', '2026-05-01', 5)], now)
    expect(s.library).toEqual({ want: 2, in_progress: 1, finished: 1, dropped: 1, total: 5 })
  })
})
