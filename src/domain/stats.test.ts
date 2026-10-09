import { describe, expect, it } from 'vitest'
import { countFinishedInMonth } from './stats'
import type { LogEntry } from './types'

const log = (finishedAt?: string): LogEntry => ({
  id: Math.random().toString(),
  itemId: 'i',
  finishedAt,
  createdAt: '2026-01-01T00:00:00.000Z',
})

describe('countFinishedInMonth', () => {
  const now = new Date(2026, 9, 15)
  it('counts only entries finished in the current month', () => {
    const logs = [log('2026-10-01'), log('2026-10-31'), log('2026-09-30'), log('2025-10-10'), log(undefined)]
    expect(countFinishedInMonth(logs, now)).toBe(2)
  })
  it('counts every finished entry for the same item (re-reads)', () => {
    expect(countFinishedInMonth([log('2026-10-02'), log('2026-10-20')], now)).toBe(2)
  })
})
