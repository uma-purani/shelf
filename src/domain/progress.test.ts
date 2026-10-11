import { describe, expect, it } from 'vitest'
import { createItem } from './items'
import { canBeCaughtUp, isCaughtUp, patchLog } from './progress'
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
    const next = patchLog(log(), { progress: '  S4E7 ', notes: ' funny ' })
    expect(next).toMatchObject({ progress: 'S4E7', notes: 'funny' })
  })
  it('clears a field when blank, leaving others alone', () => {
    const next = patchLog(log({ progress: 'S1E1', notes: 'x' }), { progress: '   ' })
    expect('progress' in next).toBe(false)
    expect(next.notes).toBe('x')
  })
  it('sets caughtUp true and clears it (no stored false)', () => {
    const on = patchLog(log(), { caughtUp: true })
    expect(on.caughtUp).toBe(true)
    const off = patchLog(on, { caughtUp: false })
    expect('caughtUp' in off).toBe(false)
  })
  it('does not mutate and ignores absent fields', () => {
    const original = log({ progress: 'S1E1' })
    const next = patchLog(original, {})
    expect(next).toEqual(original)
    expect(next).not.toBe(original)
    patchLog(original, { progress: 'S2E2' })
    expect(original.progress).toBe('S1E1')
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
