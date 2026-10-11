import { createItem, type NewItemInput } from '../domain/items'
import { applyTransition, latestLog, type StatusAction } from '../domain/status'
import type { Item, LogEntry } from '../domain/types'
import { db as defaultDb, type ShelfDB } from './db'
import { newId as generateId } from './id'

export interface Repo {
  addItem(input: NewItemInput): Promise<Item>
  /** Apply start/finish/drop. Returns an `undo` that restores the exact prior state. */
  changeStatus(
    itemId: string,
    action: StatusAction,
  ): Promise<{ item: Item; log: LogEntry; undo: () => Promise<void> }>
  getLogs(itemId: string): Promise<LogEntry[]>
  /** Remove an item and everything that belongs to it (logs, quotes). */
  deleteItem(itemId: string): Promise<void>
  /** Set (or clear, when blank) the notes on a log entry. */
  setLogNotes(logId: string, notes: string): Promise<void>
}

export function createRepo(
  db: ShelfDB = defaultDb,
  clock: () => Date = () => new Date(),
  newId: () => string = generateId,
): Repo {
  return {
    async addItem(input) {
      const item = createItem(input, clock(), newId())
      await db.items.add(item)
      return item
    },

    async changeStatus(itemId, action) {
      return db.transaction('rw', db.items, db.logs, async () => {
        const before = await db.items.get(itemId)
        if (!before) throw new Error(`Item not found: ${itemId}`)

        const logs = await db.logs.where('itemId').equals(itemId).toArray()
        const current = latestLog(logs)
        const result = applyTransition(before, current, action, clock(), newId)

        await db.items.put(result.item)
        await db.logs.put(result.log)

        const undo = async () => {
          await db.transaction('rw', db.items, db.logs, async () => {
            await db.items.put(before)
            if (result.logIsNew) await db.logs.delete(result.log.id)
            else if (current) await db.logs.put(current)
          })
        }
        return { item: result.item, log: result.log, undo }
      })
    },

    async deleteItem(itemId) {
      await db.transaction('rw', db.items, db.logs, db.quotes, async () => {
        await db.logs.where('itemId').equals(itemId).delete()
        await db.quotes.where('itemId').equals(itemId).delete()
        await db.items.delete(itemId)
      })
    },

    async setLogNotes(logId, notes) {
      const trimmed = notes.trim()
      await db.logs.where('id').equals(logId).modify((log) => {
        if (trimmed) log.notes = trimmed
        else delete log.notes
      })
    },

    async getLogs(itemId) {
      const logs = await db.logs.where('itemId').equals(itemId).toArray()
      return logs.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    },
  }
}

export const repo = createRepo()
