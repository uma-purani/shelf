import {
  backupFileName,
  buildBackup,
  describeImport,
  parseBackup,
  planImport,
  type ImportPlan,
  type Snapshot,
} from '../domain/backup'
import { db as defaultDb, type ShelfDB } from './db'
import { SETTING_KEYS, setSetting } from './settings'

export class ImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportError'
  }
}

export async function readSnapshot(db: ShelfDB = defaultDb): Promise<Snapshot> {
  const [items, logs, quotes, pendingLookups] = await Promise.all([
    db.items.toArray(),
    db.logs.toArray(),
    db.quotes.toArray(),
    db.pendingLookups.toArray(),
  ])
  return { items, logs, quotes, pendingLookups }
}

/** Everything as a backup file's text, plus a dated file name. Does not touch the last-backup time. */
export async function exportBackup(
  db: ShelfDB = defaultDb,
  now: Date = new Date(),
): Promise<{ text: string; fileName: string; itemCount: number }> {
  const snapshot = await readSnapshot(db)
  return {
    text: JSON.stringify(buildBackup(snapshot, now), null, 2),
    fileName: backupFileName(now),
    itemCount: snapshot.items.length,
  }
}

/** Record that a backup was just exported (resets the 30-day reminder). */
export async function markBackedUp(db: ShelfDB = defaultDb, now: Date = new Date()): Promise<void> {
  await setSetting(SETTING_KEYS.lastBackupAt, now.toISOString(), db)
}

export interface ImportResult {
  plan: ImportPlan
  /** One-line description for a toast. */
  message: string
  /** Reverses the import: removes what it added and restores what it overwrote. */
  undo: () => Promise<void>
}

/**
 * Merge a backup file into the database. The file is validated completely first (a bad file
 * changes nothing), then merged and written in a single transaction.
 */
export async function importBackup(text: string, db: ShelfDB = defaultDb): Promise<ImportResult> {
  const parsed = parseBackup(text)
  if (!parsed.ok) throw new ImportError(parsed.error)

  const tables = [db.items, db.logs, db.quotes, db.pendingLookups]
  const plan = await db.transaction('rw', tables, async () => {
    const p = planImport(await readSnapshot(db), parsed.snapshot)
    await db.items.bulkPut(p.writes.items)
    await db.logs.bulkPut(p.writes.logs)
    await db.quotes.bulkPut(p.writes.quotes)
    await db.pendingLookups.bulkPut(p.writes.pendingLookups)
    return p
  })

  const undo = async () => {
    await db.transaction('rw', tables, async () => {
      await db.items.bulkDelete(plan.addedIds.items)
      await db.logs.bulkDelete(plan.addedIds.logs)
      await db.quotes.bulkDelete(plan.addedIds.quotes)
      await db.pendingLookups.bulkDelete(plan.addedIds.pendingLookups)
      await db.items.bulkPut(plan.previous.items)
      await db.logs.bulkPut(plan.previous.logs)
      await db.quotes.bulkPut(plan.previous.quotes)
      await db.pendingLookups.bulkPut(plan.previous.pendingLookups)
    })
  }

  return { plan, message: describeImport(plan), undo }
}
