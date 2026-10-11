import { toLocalDate } from './dates'
import { averageRating } from './rating'
import type { Item, ItemType, LogEntry, Status } from './types'

export interface TypeCounts {
  book: number
  movie: number
  show: number
  total: number
}

export interface Stats {
  thisMonth: TypeCounts
  thisYear: TypeCounts
  allTime: TypeCounts
  /** Average over every finished run that has a rating; undefined when there are none. */
  averageRating: number | undefined
  averageRatingByType: Partial<Record<ItemType, number>>
  /** Number of items in the library by status (an item counts once, however often it was re-read). */
  library: Record<Status, number> & { total: number }
}

const emptyCounts = (): TypeCounts => ({ book: 0, movie: 0, show: 0, total: 0 })

/** Number of log entries finished in the same calendar month as `now`. Re-reads each count. */
export function countFinishedInMonth(logs: LogEntry[], now: Date): number {
  const prefix = toLocalDate(now).slice(0, 7)
  return logs.filter((l) => l.finishedAt?.startsWith(prefix)).length
}

/**
 * Finished counts by type for this month, this year and all time, plus average ratings.
 * Each finished log entry counts once, so a re-read or rewatch counts again. Entries whose
 * item no longer exists are ignored. Dates are local "YYYY-MM-DD" strings, compared by prefix.
 */
export function computeStats(items: Item[], logs: LogEntry[], now: Date): Stats {
  const today = toLocalDate(now)
  const monthPrefix = today.slice(0, 7)
  const yearPrefix = today.slice(0, 4)

  const typeById = new Map(items.map((i) => [i.id, i.type]))
  const thisMonth = emptyCounts()
  const thisYear = emptyCounts()
  const allTime = emptyCounts()
  const ratings: Array<number | undefined> = []
  const ratingsByType: Record<ItemType, Array<number | undefined>> = { book: [], movie: [], show: [] }

  for (const log of logs) {
    if (!log.finishedAt) continue
    const type = typeById.get(log.itemId)
    if (!type) continue

    allTime[type]++
    allTime.total++
    if (log.finishedAt.startsWith(yearPrefix)) {
      thisYear[type]++
      thisYear.total++
    }
    if (log.finishedAt.startsWith(monthPrefix)) {
      thisMonth[type]++
      thisMonth.total++
    }
    ratings.push(log.rating)
    ratingsByType[type].push(log.rating)
  }

  const averageRatingByType: Stats['averageRatingByType'] = {}
  for (const type of ['book', 'movie', 'show'] as const) {
    const avg = averageRating(ratingsByType[type])
    if (avg !== undefined) averageRatingByType[type] = avg
  }

  const library = { want: 0, in_progress: 0, finished: 0, dropped: 0, total: items.length }
  for (const item of items) library[item.status]++

  return { thisMonth, thisYear, allTime, averageRating: averageRating(ratings), averageRatingByType, library }
}
