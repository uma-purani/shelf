import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { exportBackup, ImportError, importBackup, markBackedUp, readSnapshot } from './backupIo'
import { ShelfDB } from './db'
import { createRepo, type Repo } from './repo'
import { getSetting, SETTING_KEYS } from './settings'

let db: ShelfDB
let repo: Repo
let now: Date
let seq: number

const fresh = () => new ShelfDB(`test-${Math.random()}`)

beforeEach(() => {
  db = fresh()
  now = new Date(2026, 9, 1, 12)
  seq = 0
  repo = createRepo(db, () => now, () => `id-${++seq}`)
})

async function populate() {
  const dune = await repo.addItem({ type: 'book', title: 'Dune', creator: 'Frank Herbert', recommendedBy: 'Sam' })
  await repo.changeStatus(dune.id, { type: 'start' })
  now = new Date(2026, 9, 3, 12)
  const fin = await repo.changeStatus(dune.id, { type: 'finish', rating: 4.5 })
  await repo.updateLog(fin.log.id, { notes: 'great' })
  await repo.addQuote({ itemId: dune.id, text: 'Fear is the mind-killer.', location: 'p. 8' })
  const show = await repo.addItem({ type: 'show', title: 'Abbott Elementary' })
  const started = await repo.changeStatus(show.id, { type: 'start' })
  await repo.updateLog(started.log.id, { progress: 'S4E3', caughtUp: true })
  await repo.addItem({ type: 'movie', title: 'heat', isDraft: true })
  return { dune, show }
}

describe('export and import', () => {
  it('exports a dated JSON file and restores everything into a fresh install', async () => {
    await populate()
    const { text, fileName, itemCount } = await exportBackup(db, new Date(2026, 9, 10, 9))
    expect(fileName).toBe('shelf-backup-2026-10-10.json')
    expect(itemCount).toBe(3)

    const target = fresh()
    const result = await importBackup(text, target)
    expect(result.plan.summary.items.added).toBe(3)

    const a = await readSnapshot(db)
    const b = await readSnapshot(target)
    const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((x, y) => x.id.localeCompare(y.id))
    expect(byId(b.items)).toEqual(byId(a.items))
    expect(byId(b.logs)).toEqual(byId(a.logs))
    expect(byId(b.quotes)).toEqual(byId(a.quotes))
  })

  it('merges: the newer edit wins, and nothing is deleted', async () => {
    const { dune } = await populate()
    const { text } = await exportBackup(db)

    // after the backup: edit Dune and add something new on this device
    now = new Date(2026, 9, 20, 12)
    await repo.replaceItem({ ...(await repo.getItem(dune.id))!, title: 'Dune (edited later)', updatedAt: now.toISOString() })
    await repo.addItem({ type: 'book', title: 'Added after backup' })

    const result = await importBackup(text, db)
    const items = await db.items.toArray()
    expect(items.find((i) => i.id === dune.id)?.title).toBe('Dune (edited later)') // local is newer: kept
    expect(items.map((i) => i.title)).toContain('Added after backup') // not deleted
    expect(result.plan.summary.items.added).toBe(0)
  })

  it('an older local copy is replaced by the newer one in the file', async () => {
    const { dune } = await populate()
    const edited = { ...(await repo.getItem(dune.id))!, title: 'Dune (from backup)', updatedAt: new Date(2026, 9, 25).toISOString() }
    await repo.replaceItem(edited)
    const { text } = await exportBackup(db)

    await repo.replaceItem({ ...edited, title: 'Dune (stale local)', updatedAt: new Date(2026, 9, 2).toISOString() })
    await importBackup(text, db)
    expect((await db.items.get(dune.id))?.title).toBe('Dune (from backup)')
  })

  it('undo removes what was added and restores what was overwritten', async () => {
    const { dune } = await populate()
    const { text } = await exportBackup(db)

    const target = fresh()
    const targetRepo = createRepo(target, () => new Date(2026, 8, 1), () => `t-${Math.random()}`)
    await target.items.put({ ...(await db.items.get(dune.id))!, title: 'Old local Dune', updatedAt: new Date(2026, 8, 1).toISOString() })
    await targetRepo.addItem({ type: 'book', title: 'Only here' })
    const before = await readSnapshot(target)

    const { undo } = await importBackup(text, target)
    expect((await target.items.count())).toBeGreaterThan(before.items.length)
    await undo()
    const after = await readSnapshot(target)
    const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((x, y) => x.id.localeCompare(y.id))
    expect(byId(after.items)).toEqual(byId(before.items))
    expect(after.logs).toEqual(before.logs)
    expect(after.quotes).toEqual(before.quotes)
  })

  it('importing the same file again changes nothing', async () => {
    await populate()
    const { text } = await exportBackup(db)
    const again = await importBackup(text, db)
    expect(again.plan.summary.items).toMatchObject({ added: 0, updated: 0 })
    expect(again.message).toMatch(/Nothing new/)
  })

  it('rejects an invalid file without changing any data', async () => {
    await populate()
    const before = await readSnapshot(db)
    await expect(importBackup('{"app":"shelf","version":1,"items":[{"id":"x"}],"logs":[],"quotes":[]}', db)).rejects.toBeInstanceOf(ImportError)
    await expect(importBackup('garbage', db)).rejects.toBeInstanceOf(ImportError)
    expect(await readSnapshot(db)).toEqual(before)
  })
})

describe('markBackedUp', () => {
  it('stores the time of the last export', async () => {
    const when = new Date(2026, 9, 10, 9)
    await markBackedUp(db, when)
    expect(await getSetting(SETTING_KEYS.lastBackupAt, db)).toBe(when.toISOString())
  })
})
