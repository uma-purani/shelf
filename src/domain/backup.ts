import { toLocalDate } from './dates'
import { isValidRating } from './rating'
import type { Item, LogEntry, PendingLookup, Quote } from './types'

export const BACKUP_APP = 'shelf'
export const BACKUP_VERSION = 1

export const BACKUP_REMINDER_DAYS = 30
export const BACKUP_REMINDER_MIN_ITEMS = 10
export const BACKUP_REMINDER_SNOOZE_DAYS = 7
/** Records added or edited since the last backup before Shelf starts nudging. */
export const BACKUP_REMINDER_CHANGES = 5
export const BACKUP_REMINDER_CHANGES_SNOOZE_DAYS = 1

const DAY_MS = 24 * 60 * 60 * 1000

export interface Snapshot {
  items: Item[]
  logs: LogEntry[]
  quotes: Quote[]
  pendingLookups: PendingLookup[]
}

export interface BackupFile extends Snapshot {
  app: typeof BACKUP_APP
  version: number
  exportedAt: string
}

export function buildBackup(snapshot: Snapshot, now: Date): BackupFile {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), ...snapshot }
}

export function backupFileName(now: Date): string {
  return `shelf-backup-${toLocalDate(now)}.json`
}

// ---------------------------------------------------------------------------------------------
// Parsing and validation
// ---------------------------------------------------------------------------------------------

export type ParseResult = { ok: true; snapshot: Snapshot } | { ok: false; error: string }

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const optStr = (o: Obj, k: string) => o[k] === undefined || isStr(o[k])

const ITEM_TYPES = ['book', 'movie', 'show']
const STATUSES = ['want', 'in_progress', 'finished', 'dropped']

/** Name of the first invalid field, or null. */
function itemProblem(o: Obj): string | null {
  if (!isStr(o.id) || !o.id) return 'id'
  if (!ITEM_TYPES.includes(o.type as string)) return 'type'
  if (!isStr(o.title) || !o.title.trim()) return 'title'
  if (!STATUSES.includes(o.status as string)) return 'status'
  if (typeof o.isDraft !== 'boolean') return 'isDraft'
  if (!Array.isArray(o.tags) || !o.tags.every(isStr)) return 'tags'
  if (o.genres !== undefined && (!Array.isArray(o.genres) || !o.genres.every(isStr))) return 'genres'
  if (!isStr(o.createdAt)) return 'createdAt'
  if (!isStr(o.updatedAt)) return 'updatedAt'
  for (const k of ['creator', 'isbn', 'coverUrl', 'externalId', 'recommendedBy']) if (!optStr(o, k)) return k
  if (o.year !== undefined && typeof o.year !== 'number') return 'year'
  return null
}

function logProblem(o: Obj): string | null {
  for (const k of ['id', 'itemId', 'createdAt']) if (!isStr(o[k]) || !o[k]) return k
  for (const k of ['startedAt', 'finishedAt', 'droppedAt', 'progress', 'notes', 'updatedAt']) if (!optStr(o, k)) return k
  if (o.rating !== undefined && !isValidRating(o.rating)) return 'rating'
  if (o.caughtUp !== undefined && typeof o.caughtUp !== 'boolean') return 'caughtUp'
  return null
}

function quoteProblem(o: Obj): string | null {
  for (const k of ['id', 'itemId', 'text', 'createdAt']) if (!isStr(o[k]) || !o[k]) return k
  for (const k of ['location', 'updatedAt']) if (!optStr(o, k)) return k
  return null
}

function pendingProblem(o: Obj): string | null {
  for (const k of ['id', 'isbn', 'createdAt']) if (!isStr(o[k]) || !o[k]) return k
  return null
}

/** Copy only the known fields, so nothing unexpected from a file ever reaches the database. */
function pick<T>(o: Obj, keys: readonly string[]): T {
  const out: Obj = {}
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k]
  return out as T
}
const ITEM_KEYS = ['id', 'type', 'title', 'creator', 'year', 'isbn', 'coverUrl', 'externalId', 'status', 'isDraft', 'recommendedBy', 'genres', 'tags', 'createdAt', 'updatedAt']
const LOG_KEYS = ['id', 'itemId', 'startedAt', 'finishedAt', 'droppedAt', 'rating', 'progress', 'caughtUp', 'notes', 'createdAt', 'updatedAt']
const QUOTE_KEYS = ['id', 'itemId', 'text', 'location', 'createdAt', 'updatedAt']
const PENDING_KEYS = ['id', 'isbn', 'createdAt']

function readTable<T extends { id: string }>(
  file: Obj,
  name: string,
  required: boolean,
  problem: (o: Obj) => string | null,
  keys: readonly string[],
  stamp: (r: T) => string,
): { rows: T[] } | { error: string } {
  const raw = file[name]
  if (raw === undefined && !required) return { rows: [] }
  if (!Array.isArray(raw)) return { error: `The file is missing its "${name}" list.` }

  const byId = new Map<string, T>()
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i]
    const bad = isObj(row) ? problem(row) : 'value'
    if (bad) return { error: `Invalid data in ${name}[${i}] (${bad}). Nothing was imported.` }
    const clean = pick<T>(row as Obj, keys)
    const prior = byId.get(clean.id)
    if (!prior || stamp(clean) > stamp(prior)) byId.set(clean.id, clean) // duplicate ids: newest wins
  }
  return { rows: [...byId.values()] }
}

export const stampOf = (r: { createdAt: string; updatedAt?: string }) => r.updatedAt ?? r.createdAt

/**
 * Read a backup file's text. Strict: if anything is wrong the whole file is rejected,
 * so a bad file can never half-import.
 */
export function parseBackup(text: string): ParseResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: "That file isn't valid JSON, so it can't be a Shelf backup." }
  }
  if (!isObj(data) || data.app !== BACKUP_APP) {
    return { ok: false, error: "That doesn't look like a Shelf backup file." }
  }
  if (typeof data.version !== 'number' || !Number.isInteger(data.version) || data.version < 1) {
    return { ok: false, error: 'The backup file has no valid version number.' }
  }
  if (data.version > BACKUP_VERSION) {
    return { ok: false, error: 'This backup was made by a newer version of Shelf. Update Shelf, then try again.' }
  }

  const items = readTable<Item>(data, 'items', true, itemProblem, ITEM_KEYS, (r) => r.updatedAt)
  if ('error' in items) return { ok: false, error: items.error }
  const logs = readTable<LogEntry>(data, 'logs', true, logProblem, LOG_KEYS, stampOf)
  if ('error' in logs) return { ok: false, error: logs.error }
  const quotes = readTable<Quote>(data, 'quotes', true, quoteProblem, QUOTE_KEYS, stampOf)
  if ('error' in quotes) return { ok: false, error: quotes.error }
  const pending = readTable<PendingLookup>(data, 'pendingLookups', false, pendingProblem, PENDING_KEYS, (r) => r.createdAt)
  if ('error' in pending) return { ok: false, error: pending.error }

  return { ok: true, snapshot: { items: items.rows, logs: logs.rows, quotes: quotes.rows, pendingLookups: pending.rows } }
}

// ---------------------------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------------------------

export interface TableSummary {
  added: number
  updated: number
  unchanged: number
}

export interface ImportPlan {
  /** Records to write: new ones, and ones newer than the local copy. */
  writes: Snapshot
  /** Local versions that the writes overwrite (to undo an import). */
  previous: Snapshot
  /** Ids that did not exist locally (to remove again on undo). */
  addedIds: { items: string[]; logs: string[]; quotes: string[]; pendingLookups: string[] }
  summary: {
    items: TableSummary
    logs: TableSummary
    quotes: TableSummary
    pendingLookups: TableSummary
    /** Logs/quotes in the file whose item exists neither in the file nor locally. */
    skippedOrphans: number
  }
}

function mergeTable<T extends { id: string }>(local: T[], incoming: T[], stamp: (r: T) => string) {
  const localById = new Map(local.map((r) => [r.id, r]))
  const writes: T[] = []
  const previous: T[] = []
  const addedIds: string[] = []
  const summary: TableSummary = { added: 0, updated: 0, unchanged: 0 }

  for (const row of incoming) {
    const existing = localById.get(row.id)
    if (!existing) {
      writes.push(row)
      addedIds.push(row.id)
      summary.added++
    } else if (stamp(row) > stamp(existing)) {
      // Strictly newer wins; a tie keeps the local copy.
      writes.push(row)
      previous.push(existing)
      summary.updated++
    } else {
      summary.unchanged++
    }
  }
  return { writes, previous, addedIds, summary }
}

/**
 * Merge a backup into the current data, record by record, matched on id: new records are added,
 * and where both sides have a record the one edited more recently wins. Nothing is ever deleted,
 * so something you deleted since the backup comes back if the file still has it.
 */
export function planImport(local: Snapshot, incoming: Snapshot): ImportPlan {
  const itemIds = new Set([...local.items.map((i) => i.id), ...incoming.items.map((i) => i.id)])
  const logs = incoming.logs.filter((l) => itemIds.has(l.itemId))
  const quotes = incoming.quotes.filter((q) => itemIds.has(q.itemId))
  const skippedOrphans = incoming.logs.length - logs.length + (incoming.quotes.length - quotes.length)

  const items = mergeTable(local.items, incoming.items, (r) => r.updatedAt)
  const logPlan = mergeTable(local.logs, logs, stampOf)
  const quotePlan = mergeTable(local.quotes, quotes, stampOf)
  const pending = mergeTable(local.pendingLookups, incoming.pendingLookups, (r) => r.createdAt)

  return {
    writes: { items: items.writes, logs: logPlan.writes, quotes: quotePlan.writes, pendingLookups: pending.writes },
    previous: { items: items.previous, logs: logPlan.previous, quotes: quotePlan.previous, pendingLookups: pending.previous },
    addedIds: { items: items.addedIds, logs: logPlan.addedIds, quotes: quotePlan.addedIds, pendingLookups: pending.addedIds },
    summary: { items: items.summary, logs: logPlan.summary, quotes: quotePlan.summary, pendingLookups: pending.summary, skippedOrphans },
  }
}

/** One-line description of what an import did, e.g. "Added 12 items, updated 3, 4 quotes". */
export function describeImport(plan: ImportPlan): string {
  const s = plan.summary
  const added = s.items.added + s.logs.added + s.quotes.added
  const updated = s.items.updated + s.logs.updated + s.quotes.updated
  if (added === 0 && updated === 0) return 'Nothing new: your data already has everything in this backup.'
  const parts = [`${s.items.added} new ${s.items.added === 1 ? 'item' : 'items'}`]
  if (s.items.updated) parts.push(`${s.items.updated} updated`)
  if (s.logs.added || s.logs.updated) parts.push(`${s.logs.added + s.logs.updated} log ${s.logs.added + s.logs.updated === 1 ? 'entry' : 'entries'}`)
  if (s.quotes.added || s.quotes.updated) parts.push(`${s.quotes.added + s.quotes.updated} ${s.quotes.added + s.quotes.updated === 1 ? 'quote' : 'quotes'}`)
  return `Imported ${parts.join(', ')}.`
}

// ---------------------------------------------------------------------------------------------
// Backup reminder
// ---------------------------------------------------------------------------------------------

const validTime = (iso: string | undefined): number | undefined => {
  if (!iso) return undefined
  const t = Date.parse(iso)
  return Number.isNaN(t) ? undefined : t
}

/** Whole days since an ISO timestamp, or undefined if it is missing or invalid. */
export function daysSince(iso: string | undefined, now: Date): number | undefined {
  const t = validTime(iso)
  return t === undefined ? undefined : Math.max(0, Math.floor((now.getTime() - t) / DAY_MS))
}

/** How many records (items, log entries, quotes) were added or edited since the last backup. Everything counts if there never was one. */
export function countUnsavedChanges(
  data: Pick<Snapshot, 'items' | 'logs' | 'quotes'>,
  lastBackupAt: string | undefined,
): number {
  const since = lastBackupAt && validTime(lastBackupAt) !== undefined ? lastBackupAt : undefined
  const newer = (stamp: string) => since === undefined || stamp > since
  return (
    data.items.filter((i) => newer(i.updatedAt)).length +
    data.logs.filter((l) => newer(stampOf(l))).length +
    data.quotes.filter((q) => newer(stampOf(q))).length
  )
}

export type ReminderReason = 'changes' | 'age' | 'never'

/**
 * Whether to nudge the user to back up, and why:
 * - `changes`: 5 or more records are not in any backup yet (snoozed for a day when dismissed),
 * - `age`: the last export is more than 30 days old,
 * - `never`: no export yet and the library has at least 10 items.
 * Age and "never" reminders stay dismissed for a week.
 */
export function backupReminder(args: {
  lastBackupAt?: string
  dismissedAt?: string
  itemCount: number
  unsavedChanges?: number
  now: Date
}): { show: boolean; reason?: ReminderReason } {
  const { lastBackupAt, dismissedAt, itemCount, unsavedChanges = 0, now } = args

  const last = validTime(lastBackupAt)
  const timeReason: ReminderReason | undefined =
    last !== undefined
      ? now.getTime() - last > BACKUP_REMINDER_DAYS * DAY_MS
        ? 'age'
        : undefined
      : itemCount >= BACKUP_REMINDER_MIN_ITEMS
        ? 'never'
        : undefined
  const reason: ReminderReason | undefined = timeReason ?? (unsavedChanges >= BACKUP_REMINDER_CHANGES ? 'changes' : undefined)
  if (!reason) return { show: false }

  const dismissed = validTime(dismissedAt)
  const snoozeDays = timeReason ? BACKUP_REMINDER_SNOOZE_DAYS : BACKUP_REMINDER_CHANGES_SNOOZE_DAYS
  if (dismissed !== undefined && now.getTime() - dismissed < snoozeDays * DAY_MS) return { show: false }
  return { show: true, reason }
}

/** Yes/no form of backupReminder. */
export function shouldShowBackupReminder(args: Parameters<typeof backupReminder>[0]): boolean {
  return backupReminder(args).show
}
