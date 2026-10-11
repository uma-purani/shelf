import { toLocalDate } from './dates'
import { isValidRating } from './rating'
import type { Item, LogEntry, Status } from './types'

export type StatusAction =
  | { type: 'start' }
  | { type: 'finish'; rating: number; notes?: string }
  | { type: 'drop' }

export class TransitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TransitionError'
  }
}

export interface TransitionResult {
  item: Item
  /** The log entry to save: newly created (start) or the updated current one (finish/drop). */
  log: LogEntry
  /** True when `log` is new, false when it replaces `currentLog`. */
  logIsNew: boolean
}

/** The most recent log entry (by createdAt; later array position wins ties). */
export function latestLog(logs: LogEntry[]): LogEntry | undefined {
  let latest: LogEntry | undefined
  for (const log of logs) {
    if (!latest || log.createdAt >= latest.createdAt) latest = log
  }
  return latest
}

/**
 * Pure status transition. Dates are stamped automatically.
 *
 * - start:  want | finished | dropped -> in_progress, always opens a NEW log entry
 *           (re-read / rewatch / resume keeps earlier history).
 * - finish: in_progress -> finished, requires a valid rating, closes the current entry.
 * - drop:   in_progress -> dropped, no rating needed, closes the current entry.
 */
export function applyTransition(
  item: Item,
  currentLog: LogEntry | undefined,
  action: StatusAction,
  now: Date,
  newLogId: () => string,
): TransitionResult {
  const iso = now.toISOString()
  const today = toLocalDate(now)

  switch (action.type) {
    case 'start': {
      if (item.status === 'in_progress') {
        throw new TransitionError('Item is already in progress')
      }
      const log: LogEntry = {
        id: newLogId(),
        itemId: item.id,
        startedAt: today,
        createdAt: iso,
        updatedAt: iso,
      }
      return { item: { ...item, status: 'in_progress', updatedAt: iso }, log, logIsNew: true }
    }

    case 'finish': {
      if (item.status !== 'in_progress') {
        throw new TransitionError('Only items in progress can be finished')
      }
      if (!isValidRating(action.rating)) {
        throw new TransitionError('A rating from 0.5 to 5 (in 0.5 steps) is required to finish')
      }
      if (!currentLog) {
        throw new TransitionError('In-progress item has no log entry')
      }
      const { caughtUp: _caughtUp, ...open } = currentLog
      const log: LogEntry = {
        ...open,
        finishedAt: today,
        updatedAt: iso,
        rating: action.rating,
        ...(action.notes ? { notes: action.notes } : {}),
      }
      return { item: { ...item, status: 'finished', updatedAt: iso }, log, logIsNew: false }
    }

    case 'drop': {
      if (item.status !== 'in_progress') {
        throw new TransitionError('Only items in progress can be dropped')
      }
      if (!currentLog) {
        throw new TransitionError('In-progress item has no log entry')
      }
      const { caughtUp: _caughtUp, ...open } = currentLog
      const log: LogEntry = { ...open, droppedAt: today, updatedAt: iso }
      return { item: { ...item, status: 'dropped', updatedAt: iso }, log, logIsNew: false }
    }
  }
}

export function canStart(status: Status): boolean {
  return status !== 'in_progress'
}
