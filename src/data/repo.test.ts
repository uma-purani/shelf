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

  it('sets and clears log notes', async () => {
    const item = await repo.addItem({ type: 'book', title: 'Emma' })
    await repo.changeStatus(item.id, { type: 'start' })
    const { log } = await repo.changeStatus(item.id, { type: 'finish', rating: 4 })
    await repo.updateLog(log.id, { notes: '  loved it ' })
    expect((await repo.getLogs(item.id))[0].notes).toBe('loved it')
    await repo.updateLog(log.id, { notes: '  ' })
    expect((await repo.getLogs(item.id))[0].notes).toBeUndefined()
  })

  it('tracks progress and caught-up on an in-progress show, with undo', async () => {
    const item = await repo.addItem({ type: 'show', title: 'Abbott Elementary' })
    const { log } = await repo.changeStatus(item.id, { type: 'start' })
    await repo.updateLog(log.id, { progress: 'S4E7' })
    const { undo } = await repo.updateLog(log.id, { caughtUp: true })
    expect((await repo.getLogs(item.id))[0]).toMatchObject({ progress: 'S4E7', caughtUp: true })
    expect((await db.items.get(item.id))?.status).toBe('in_progress')

    await undo()
    expect((await repo.getLogs(item.id))[0].caughtUp).toBeUndefined()
    expect((await repo.getLogs(item.id))[0].progress).toBe('S4E7')
  })

  it('refuses caught-up for books, and for shows that are not in progress', async () => {
    const book = await repo.addItem({ type: 'book', title: 'Dune' })
    const bookLog = (await repo.changeStatus(book.id, { type: 'start' })).log
    await expect(repo.updateLog(bookLog.id, { caughtUp: true })).rejects.toThrow()

    const show = await repo.addItem({ type: 'show', title: 'Severance' })
    const showLog = (await repo.changeStatus(show.id, { type: 'start' })).log
    await repo.updateLog(showLog.id, { caughtUp: true })
    await repo.changeStatus(show.id, { type: 'finish', rating: 5 })
    const finished = (await repo.getLogs(show.id))[0]
    expect(finished.caughtUp).toBeUndefined()
    await expect(repo.updateLog(finished.id, { caughtUp: true })).rejects.toThrow()
  })

  it('deletes an item together with its logs and quotes', async () => {
    const item = await repo.addItem({ type: 'book', title: 'Emma' })
    const other = await repo.addItem({ type: 'book', title: 'Dune' })
    await repo.changeStatus(item.id, { type: 'start' })
    await db.quotes.add({ id: 'q1', itemId: item.id, text: 'hi', createdAt: now.toISOString() })
    const { undo } = await repo.deleteItem(item.id)
    expect(await db.items.get(item.id)).toBeUndefined()
    expect(await db.logs.where('itemId').equals(item.id).count()).toBe(0)
    expect(await db.quotes.where('itemId').equals(item.id).count()).toBe(0)
    expect(await db.items.get(other.id)).toBeDefined()

    await undo()
    expect((await db.items.get(item.id))?.status).toBe('in_progress')
    expect(await db.logs.where('itemId').equals(item.id).count()).toBe(1)
    expect(await db.quotes.where('itemId').equals(item.id).count()).toBe(1)
  })

  it('replaces an item and can undo it', async () => {
    const draft = await repo.addItem({ type: 'book', title: 'dune', isDraft: true })
    const { undo } = await repo.replaceItem({ ...draft, title: 'Dune', isDraft: false })
    expect(await repo.getItem(draft.id)).toMatchObject({ title: 'Dune', isDraft: false })
    await undo()
    expect(await repo.getItem(draft.id)).toMatchObject({ title: 'dune', isDraft: true })
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
