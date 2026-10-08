import type { DateString } from './types'

/** Local calendar date as "YYYY-MM-DD" (not UTC, so late-evening logs land on the right day). */
export function toLocalDate(d: Date): DateString {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
