import { createItem, type NewItemInput } from '../domain/items'
import { canBeCaughtUp, patchLog, type LogPatch } from '../domain/progress'
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
  /** Remove an item and everything that belongs to it (logs, quotes). undo restores all of it. */
  deleteItem(itemId: string): Promise<{ undo: () => Promise<void> }>
  /** Overwrite an item (e.g. matching a draft). undo restores the previous version. */
  replaceItem(next: Item): Promise<{ undo: () => Promise<void> }>
  getItem(itemId: string): Promise<Item | undefined>
  /**
   * Edit a log entry's progress, notes or caught-up flag (blank text clears a field).
   * `undo` restores the previous version of the entry.
   */
  updateLog(logId: string, patch: LogPatch): Promise<{ log: LogEntry; undo: () => Promise<void> }>
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
      return db.transaction('rw', db.items, db.logs, db.quotes, async () => {
        const [item, logs, quotes] = await Promise.all([
          db.items.get(itemId),
          db.logs.where('itemId').equals(itemId).toArray(),
          db.quotes.where('itemId').equals(itemId).toArray(),
        ])
        await db.logs.where('itemId').equals(itemId).delete()
        await db.quotes.where('itemId').equals(itemId).delete()
        await db.items.delete(itemId)
        const undo = async () => {
          if (!item) return
          await db.transaction('rw', db.items, db.logs, db.quotes, async () => {
            await db.items.put(item)
            await db.logs.bulkPut(logs)
            await db.quotes.bulkPut(quotes)
          })
        }
        return { undo }
      })
    },

    async replaceItem(next) {
      const before = await db.items.get(next.id)
      if (!before) throw new Error(`Item not found: ${next.id}`)
      await db.items.put(next)
      return { undo: async () => void (await db.items.put(before)) }
    },

    getItem: (itemId) => db.items.get(itemId),

    async updateLog(logId, patch) {
      return db.transaction('rw', db.items, db.logs, async () => {
        const before = await db.logs.get(logId)
        if (!before) throw new Error(`Log entry not found: ${logId}`)
        if (patch.caughtUp === true) {
          const item = await db.items.get(before.itemId)
          if (!item || !canBeCaughtUp(item)) {
            throw new Error('Only a show that is in progress can be marked caught up')
          }
        }
        const log = patchLog(before, patch)
        await db.logs.put(log)
        return { log, undo: async () => void (await db.logs.put(before)) }
      })
    },

    async getLogs(itemId) {
      const logs = await db.logs.where('itemId').equals(itemId).toArray()
      return logs.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    },
  }
}

export const repo = createRepo()
