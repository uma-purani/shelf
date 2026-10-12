import { describe, expect, it } from 'vitest'
import { createItem } from './items'
import { canBeCaughtUp, isCaughtUp, isValidDateString, LogEditError, patchLog } from './progress'
import { applyTransition } from './status'
import type { Item, LogEntry } from './types'

const t0 = new Date(2026, 9, 1, 12)
const t1 = new Date(2026, 9, 5, 12)
const log = (extra: Partial<LogEntry> = {}): LogEntry => ({
  id: 'l1',
  itemId: 'i1',
  startedAt: '2026-10-01',
  createdAt: t0.toISOString(),
  ...extra,
})
const show = (status: Item['status'] = 'in_progress'): Item => ({
  ...createItem({ type: 'show', title: 'Abbott Elementary' }, t0, 'i1'),
  status,
})

describe('canBeCaughtUp / isCaughtUp', () => {
  it('only applies to shows that are in progress', () => {
    expect(canBeCaughtUp(show())).toBe(true)
    expect(canBeCaughtUp(show('want'))).toBe(false)
    expect(canBeCaughtUp(show('finished'))).toBe(false)
    expect(canBeCaughtUp({ type: 'book', status: 'in_progress' })).toBe(false)
    expect(canBeCaughtUp({ type: 'movie', status: 'in_progress' })).toBe(false)
  })
  it('needs both the status and the flag', () => {
    expect(isCaughtUp(show(), log({ caughtUp: true }))).toBe(true)
    expect(isCaughtUp(show(), log())).toBe(false)
    expect(isCaughtUp(show(), undefined)).toBe(false)
    expect(isCaughtUp(show('finished'), log({ caughtUp: true }))).toBe(false)
  })
})

describe('patchLog', () => {
  it('sets and trims progress and notes', () => {
    const next = patchLog(log(), { progress: '  S4E7 ', notes: ' funny ' }, t1)
    expect(next).toMatchObject({ progress: 'S4E7', notes: 'funny' })
  })
  it('clears a field when blank, leaving others alone', () => {
    const next = patchLog(log({ progress: 'S1E1', notes: 'x' }), { progress: '   ' }, t1)
    expect('progress' in next).toBe(false)
    expect(next.notes).toBe('x')
  })
  it('sets caughtUp true and clears it (no stored false)', () => {
    const on = patchLog(log(), { caughtUp: true }, t1)
    expect(on.caughtUp).toBe(true)
    const off = patchLog(on, { caughtUp: false }, t1)
    expect('caughtUp' in off).toBe(false)
  })
  it('does not mutate, ignores absent fields and stamps updatedAt', () => {
    const original = log({ progress: 'S1E1' })
    const next = patchLog(original, {}, t1)
    expect(next).toEqual({ ...original, updatedAt: t1.toISOString() })
    expect(next).not.toBe(original)
    patchLog(original, { progress: 'S2E2' }, t1)
    expect(original.progress).toBe('S1E1')
    expect(original.updatedAt).toBeUndefined()
  })
})

describe('editing log dates', () => {
  const finished = log({ startedAt: '2026-10-01', finishedAt: '2026-10-05', rating: 4 })
  const dropped = log({ startedAt: '2026-10-01', droppedAt: '2026-10-03' })
  const t = new Date(2026, 9, 20, 12) // "today" is 2026-10-20

  it('changes the start and finish dates and stamps updatedAt', () => {
    const next = patchLog(finished, { startedAt: '2026-09-28', finishedAt: '2026-10-09' }, t)
    expect(next).toMatchObject({ startedAt: '2026-09-28', finishedAt: '2026-10-09', rating: 4 })
    expect(next.updatedAt).toBe(t.toISOString())
    expect(finished.finishedAt).toBe('2026-10-05') // original untouched
  })

  it('allows the same start and finish day, and a finish on today', () => {
    expect(patchLog(finished, { finishedAt: '2026-10-01' }, t).finishedAt).toBe('2026-10-01')
    expect(patchLog(finished, { finishedAt: '2026-10-20' }, t).finishedAt).toBe('2026-10-20')
  })

  it('edits the drop date of a dropped entry', () => {
    expect(patchLog(dropped, { droppedAt: '2026-10-10' }, t).droppedAt).toBe('2026-10-10')
  })

  it('lets the start date be cleared but never the finish or drop date', () => {
    expect('startedAt' in patchLog(finished, { startedAt: '' }, t)).toBe(false)
    expect(() => patchLog(finished, { finishedAt: '' }, t)).toThrow(LogEditError)
    expect(() => patchLog(dropped, { droppedAt: ' ' }, t)).toThrow(LogEditError)
  })

  it('cannot invent a finish or drop date on an entry that has none', () => {
    expect(() => patchLog(log({ startedAt: '2026-10-01' }), { finishedAt: '2026-10-05' }, t)).toThrow(/no finish date/)
    expect(() => patchLog(finished, { droppedAt: '2026-10-05' }, t)).toThrow(/no drop date/)
  })

  it('rejects a finish or drop before the start, whichever side was edited', () => {
    expect(() => patchLog(finished, { finishedAt: '2026-09-30' }, t)).toThrow(/before the start/)
    expect(() => patchLog(finished, { startedAt: '2026-10-06' }, t)).toThrow(/before the start/)
    expect(() => patchLog(dropped, { droppedAt: '2026-09-01' }, t)).toThrow(/before the start/)
  })

  it('rejects the future and anything that is not a real date', () => {
    expect(() => patchLog(finished, { finishedAt: '2026-10-21' }, t)).toThrow(/future/)
    expect(() => patchLog(finished, { startedAt: '2027-01-01' }, t)).toThrow(/future/)
    for (const bad of ['2026-02-30', '2026-13-01', '10/05/2026', 'yesterday', '2026-1-5']) {
      expect(() => patchLog(finished, { finishedAt: bad }, t)).toThrow(LogEditError)
    }
  })

  it('does not police dates when only other fields are edited', () => {
    const odd = log({ startedAt: '2026-10-09', finishedAt: '2026-10-01' }) // inconsistent legacy data
    expect(patchLog(odd, { notes: 'x' }, t).notes).toBe('x')
  })
})

describe('isValidDateString', () => {
  it('accepts real calendar dates only', () => {
    expect(isValidDateString('2024-02-29')).toBe(true) // leap day
    expect(isValidDateString('2026-02-29')).toBe(false)
    expect(isValidDateString('2026-04-31')).toBe(false)
    expect(isValidDateString('2026-12-31')).toBe(true)
  })
})

describe('leaving in-progress clears caught up', () => {
  const caught = log({ caughtUp: true })
  it('finishing clears the flag', () => {
    const r = applyTransition(show(), caught, { type: 'finish', rating: 4.5 }, t1, () => 'x')
    expect('caughtUp' in r.log).toBe(false)
    expect(r.log.rating).toBe(4.5)
  })
  it('dropping clears the flag', () => {
    const r = applyTransition(show(), caught, { type: 'drop' }, t1, () => 'x')
    expect('caughtUp' in r.log).toBe(false)
  })
})
