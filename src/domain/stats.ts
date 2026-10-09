import { toLocalDate } from './dates'
import type { LogEntry } from './types'

/** Number of log entries finished in the same calendar month as `now`. Re-reads each count. */
export function countFinishedInMonth(logs: LogEntry[], now: Date): number {
  const prefix = toLocalDate(now).slice(0, 7)
  return logs.filter((l) => l.finishedAt?.startsWith(prefix)).length
}
