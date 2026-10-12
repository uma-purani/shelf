import { toLocalDate } from './dates'
import type { Item, LogEntry } from './types'

export interface LogPatch {
  progress?: string
  notes?: string
  caughtUp?: boolean
  /** "YYYY-MM-DD". Blank clears it (an unknown start date is fine). */
  startedAt?: string
  /** "YYYY-MM-DD". Can only be changed on an entry that already has one. */
  finishedAt?: string
  /** "YYYY-MM-DD". Can only be changed on an entry that already has one. */
  droppedAt?: string
}

/** A rejected edit; the message is written for the user. */
export class LogEditError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LogEditError'
  }
}

/** Only a show that is currently in progress can be "caught up" (waiting for new episodes or a new season). */
export function canBeCaughtUp(item: Pick<Item, 'type' | 'status'>): boolean {
  return item.type === 'show' && item.status === 'in_progress'
}

/** True when the item is an in-progress show whose current run is marked caught up. */
export function isCaughtUp(item: Item, log: LogEntry | undefined): boolean {
  return canBeCaughtUp(item) && log?.caughtUp === true
}

/** A real calendar date written "YYYY-MM-DD" ("2026-02-30" is rejected). */
export function isValidDateString(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(y, mo - 1, d)
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d
}

/** The user-facing reason a log's dates are not acceptable, or null when they are. */
export function dateProblem(log: LogEntry, today: string): string | null {
  const dates = [
    ['start', log.startedAt],
    ['finish', log.finishedAt],
    ['drop', log.droppedAt],
  ] as const
  for (const [name, value] of dates) {
    if (value === undefined) continue
    if (!isValidDateString(value)) return `The ${name} date isn't a valid date.`
    if (value > today) return "Dates can't be in the future."
  }
  if (log.startedAt && log.finishedAt && log.finishedAt < log.startedAt) {
    return "The finish date can't be before the start date."
  }
  if (log.startedAt && log.droppedAt && log.droppedAt < log.startedAt) {
    return "The drop date can't be before the start date."
  }
  return null
}

/**
 * Apply an edit to a log entry. Text is trimmed and a blank value clears the field;
 * `caughtUp: false` clears the flag rather than storing false. Fields not in the patch are untouched.
 * Always stamps `updatedAt`.
 *
 * Date edits are checked: real dates, not in the future, finish/drop not before start. A start date can
 * be cleared; a finish or drop date can be changed but never removed or invented (that would be a status
 * change, which has its own actions). Throws LogEditError when an edit is rejected.
 */
export function patchLog(log: LogEntry, patch: LogPatch, now: Date): LogEntry {
  const next: LogEntry = { ...log, updatedAt: now.toISOString() }
  if (patch.progress !== undefined) {
    const v = patch.progress.trim()
    if (v) next.progress = v
    else delete next.progress
  }
  if (patch.notes !== undefined) {
    const v = patch.notes.trim()
    if (v) next.notes = v
    else delete next.notes
  }
  if (patch.caughtUp !== undefined) {
    if (patch.caughtUp) next.caughtUp = true
    else delete next.caughtUp
  }

  let datesEdited = false
  if (patch.startedAt !== undefined) {
    datesEdited = true
    const v = patch.startedAt.trim()
    if (v) next.startedAt = v
    else delete next.startedAt
  }
  for (const field of ['finishedAt', 'droppedAt'] as const) {
    const raw = patch[field]
    if (raw === undefined) continue
    datesEdited = true
    const label = field === 'finishedAt' ? 'finish' : 'drop'
    if (!log[field]) throw new LogEditError(`This entry has no ${label} date to change.`)
    const v = raw.trim()
    if (!v) throw new LogEditError(`The ${label} date can't be removed.`)
    next[field] = v
  }
  if (datesEdited) {
    const problem = dateProblem(next, toLocalDate(now))
    if (problem) throw new LogEditError(problem)
  }
  return next
}
