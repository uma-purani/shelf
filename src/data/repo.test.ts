import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { ShelfDB } from './db'
import { createRepo, type Repo } from './repo'

let db: ShelfDB
let repo: Repo
let now: Date
let seq: number

beforeEach(async () => {
  db = new ShelfDB(`test-${Math.random()}`)
  now = new Date(2026, 9, 1, 12)
  seq = 0
  repo = createRepo(db, () => now, () => `id-${++seq}`)
})

describe('repo', () => {
  it('runs the full loop and persists status, log and dates', async () => {
    const item = await repo.addItem({ type: 'book', title: 'Dune' })
    now = new Date(2026, 9, 2, 12)
    await repo.changeStatus(item.id, { type: 'start' })
    now = new Date(2026, 9, 8, 12)
    await repo.changeStatus(item.id, { type: 'finish', rating: 4.5 })

    expect((await db.items.get(item.id))?.status).toBe('finished')
    const logs = await repo.getLogs(item.id)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ startedAt: '2026-10-02', finishedAt: '2026-10-08', rating: 4.5 })
  })

  it('rejects finishing without a rating and leaves data unchanged', async () => {
    const item = await repo.addItem({ type: 'show', title: 'Severance' })
    await repo.changeStatus(item.id, { type: 'start' })
    await expect(
      // @ts-expect-error runtime guard
      repo.changeStatus(item.id, { type: 'finish' }),
    ).rejects.toThrow()
    expect((await db.items.get(item.id))?.status).toBe('in_progress')
  })

  it('undo of start removes the new log and restores want', async () => {
    const item = await repo.addItem({ type: 'movie', title: 'Heat' })
    const { undo } = await repo.changeStatus(item.id, { type: 'start' })
    await undo()
    expect((await db.items.get(item.id))?.status).toBe('want')
    expect(await repo.getLogs(item.id)).toHaveLength(0)
  })

  it('undo of finish restores in_progress and clears the rating', async () => {
    const item = await repo.addItem({ type: 'book', title: 'Emma' })
    await repo.changeStatus(item.id, { type: 'start' })
    const { undo } = await repo.changeStatus(item.id, { type: 'finish', rating: 3 })
    await undo()
    expect((await db.items.get(item.id))?.status).toBe('in_progress')
    const [log] = await repo.getLogs(item.id)
    expect(log.rating).toBeUndefined()
    expect(log.finishedAt).toBeUndefined()
  })

  it('keeps both log entries for a re-read', async () => {
    const item = await repo.addItem({ type: 'book', title: 'Dune' })
    await repo.changeStatus(item.id, { type: 'start' })
    now = new Date(2026, 9, 3, 12)
    await repo.changeStatus(item.id, { type: 'finish', rating: 4 })
    now = new Date(2026, 9, 4, 12)
    await repo.changeStatus(item.id, { type: 'start' })
    now = new Date(2026, 9, 5, 12)
    await repo.changeStatus(item.id, { type: 'finish', rating: 5 })

    const logs = await repo.getLogs(item.id)
    expect(logs.map((l) => l.rating)).toEqual([4, 5])
  })
})
