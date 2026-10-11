import type { Item, LogEntry } from './types'

export interface LogPatch {
  progress?: string
  notes?: string
  caughtUp?: boolean
}

/** Only a show that is currently in progress can be "caught up" (waiting for new episodes or a new season). */
export function canBeCaughtUp(item: Pick<Item, 'type' | 'status'>): boolean {
  return item.type === 'show' && item.status === 'in_progress'
}

/** True when the item is an in-progress show whose current run is marked caught up. */
export function isCaughtUp(item: Item, log: LogEntry | undefined): boolean {
  return canBeCaughtUp(item) && log?.caughtUp === true
}

/**
 * Apply an edit to a log entry. Text is trimmed and a blank value clears the field;
 * `caughtUp: false` clears the flag rather than storing false. Fields not in the patch are untouched.
 */
export function patchLog(log: LogEntry, patch: LogPatch): LogEntry {
  const next: LogEntry = { ...log }
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
  return next
}
