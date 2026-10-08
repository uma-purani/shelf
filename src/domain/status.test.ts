import { describe, expect, it } from 'vitest'
import { createItem } from './items'
import { applyTransition, latestLog, TransitionError } from './status'
import type { Item, LogEntry } from './types'

const t0 = new Date(2026, 9, 1, 12, 0, 0) // local: 2026-10-01
const t1 = new Date(2026, 9, 5, 12, 0, 0)
const t2 = new Date(2026, 9, 9, 12, 0, 0)
let n = 0
const id = () => `log-${++n}`

const want = (): Item => createItem({ type: 'book', title: 'Dune' }, t0, 'item-1')

function started(): { item: Item; log: LogEntry } {
  const r = applyTransition(want(), undefined, { type: 'start' }, t1, id)
  return { item: r.item, log: r.log }
}

describe('start', () => {
  it('moves want to in_progress and stamps startedAt on a new log', () => {
    const r = applyTransition(want(), undefined, { type: 'start' }, t1, id)
    expect(r.item.status).toBe('in_progress')
    expect(r.logIsNew).toBe(true)
    expect(r.log.startedAt).toBe('2026-10-05')
    expect(r.log.finishedAt).toBeUndefined()
    expect(r.log.itemId).toBe('item-1')
  })
  it('cannot start an item already in progress', () => {
    const { item, log } = started()
    expect(() => applyTransition(item, log, { type: 'start' }, t2, id)).toThrow(TransitionError)
  })
})

describe('finish', () => {
  it('requires a rating', () => {
    const { item, log } = started()
    // @ts-expect-error rating is required by the type; test the runtime guard too
    expect(() => applyTransition(item, log, { type: 'finish' }, t2, id)).toThrow(TransitionError)
    expect(() => applyTransition(item, log, { type: 'finish', rating: 0 }, t2, id)).toThrow(TransitionError)
    expect(() => applyTransition(item, log, { type: 'finish', rating: 3.3 }, t2, id)).toThrow(TransitionError)
  })
  it('sets finished, rating and finishedAt in one step, keeping startedAt', () => {
    const { item, log } = started()
    const r = applyTransition(item, log, { type: 'finish', rating: 3.5 }, t2, id)
    expect(r.item.status).toBe('finished')
    expect(r.logIsNew).toBe(false)
    expect(r.log.id).toBe(log.id)
    expect(r.log.rating).toBe(3.5)
    expect(r.log.finishedAt).toBe('2026-10-09')
    expect(r.log.startedAt).toBe('2026-10-05')
  })
  it('stores optional notes', () => {
    const { item, log } = started()
    const r = applyTransition(item, log, { type: 'finish', rating: 4, notes: 'great' }, t2, id)
    expect(r.log.notes).toBe('great')
  })
  it('cannot finish a want item', () => {
    expect(() => applyTransition(want(), undefined, { type: 'finish', rating: 4 }, t2, id)).toThrow(TransitionError)
  })
})

describe('drop', () => {
  it('drops without a rating and stamps droppedAt', () => {
    const { item, log } = started()
    const r = applyTransition(item, log, { type: 'drop' }, t2, id)
    expect(r.item.status).toBe('dropped')
    expect(r.log.droppedAt).toBe('2026-10-09')
    expect(r.log.rating).toBeUndefined()
    expect(r.log.finishedAt).toBeUndefined()
  })
  it('cannot drop an item that is not in progress', () => {
    expect(() => applyTransition(want(), undefined, { type: 'drop' }, t2, id)).toThrow(TransitionError)
  })
})

describe('re-read, rewatch and resume', () => {
  it('starting a finished item opens a second log and leaves the first intact', () => {
    const s = started()
    const fin = applyTransition(s.item, s.log, { type: 'finish', rating: 4 }, t1, id)
    const again = applyTransition(fin.item, fin.log, { type: 'start' }, t2, id)
    expect(again.item.status).toBe('in_progress')
    expect(again.logIsNew).toBe(true)
    expect(again.log.id).not.toBe(fin.log.id)
    expect(fin.log.rating).toBe(4)
  })
  it('a dropped item can be restarted', () => {
    const s = started()
    const dropped = applyTransition(s.item, s.log, { type: 'drop' }, t1, id)
    const again = applyTransition(dropped.item, dropped.log, { type: 'start' }, t2, id)
    expect(again.item.status).toBe('in_progress')
    expect(again.logIsNew).toBe(true)
  })
})

describe('latestLog', () => {
  it('picks the most recently created entry', () => {
    const a = { id: 'a', itemId: 'i', createdAt: '2026-01-01T00:00:00.000Z' } as LogEntry
    const b = { id: 'b', itemId: 'i', createdAt: '2026-02-01T00:00:00.000Z' } as LogEntry
    expect(latestLog([b, a])?.id).toBe('b')
    expect(latestLog([])).toBeUndefined()
  })
})

describe('createItem', () => {
  it('requires a non-empty title and defaults to a non-draft want item', () => {
    expect(() => createItem({ type: 'movie', title: '   ' }, t0, 'x')).toThrow()
    const item = createItem({ type: 'movie', title: ' Heat ', creator: '' }, t0, 'x')
    expect(item.title).toBe('Heat')
    expect(item.status).toBe('want')
    expect(item.isDraft).toBe(false)
    expect(item.tags).toEqual([])
    expect('creator' in item).toBe(false)
  })
})
