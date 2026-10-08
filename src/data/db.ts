import Dexie, { type EntityTable } from 'dexie'
import type { Item, LogEntry, PendingLookup, Quote, SettingRow } from '../domain/types'

export class ShelfDB extends Dexie {
  items!: EntityTable<Item, 'id'>
  logs!: EntityTable<LogEntry, 'id'>
  quotes!: EntityTable<Quote, 'id'>
  pendingLookups!: EntityTable<PendingLookup, 'id'>
  settings!: EntityTable<SettingRow, 'key'>

  constructor(name = 'shelf') {
    super(name)
    this.version(1).stores({
      items: 'id, type, status, isDraft, recommendedBy, updatedAt',
      logs: 'id, itemId, finishedAt, createdAt',
      quotes: 'id, itemId, createdAt',
      pendingLookups: 'id, createdAt',
      settings: 'key',
    })
  }
}

export const db = new ShelfDB()

/** Ask the browser not to evict our data. Safe to call repeatedly; failures are non-fatal. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
