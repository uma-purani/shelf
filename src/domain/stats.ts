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

export interface HistoryBucket {
  /** "2026-10" for a month, "2026" for a year. */
  key: string
  /** Short axis label: "Oct" or "2026". */
  label: string
  year: number
  book: number
  movie: number
  show: number
  total: number
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function emptyBucket(key: string, label: string, year: number): HistoryBucket {
  return { key, label, year, book: 0, movie: 0, show: 0, total: 0 }
}

/** Finished runs as [item type, "YYYY-MM-DD"], skipping runs whose item no longer exists. */
function finishedRuns(items: Item[], logs: LogEntry[]): Array<[ItemType, string]> {
  const typeById = new Map(items.map((i) => [i.id, i.type]))
  const runs: Array<[ItemType, string]> = []
  for (const log of logs) {
    const type = typeById.get(log.itemId)
    if (log.finishedAt && type) runs.push([type, log.finishedAt])
  }
  return runs
}

/** Finished runs per calendar month for the last `months` months, oldest first, ending with this month. */
export function monthlyHistory(items: Item[], logs: LogEntry[], now: Date, months = 12): HistoryBucket[] {
  const buckets: HistoryBucket[] = []
  const byKey = new Map<string, HistoryBucket>()
  for (let back = months - 1; back >= 0; back--) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const bucket = emptyBucket(key, MONTH_LABELS[d.getMonth()], d.getFullYear())
    buckets.push(bucket)
    byKey.set(key, bucket)
  }
  for (const [type, finishedAt] of finishedRuns(items, logs)) {
    const bucket = byKey.get(finishedAt.slice(0, 7))
    if (bucket) {
      bucket[type]++
      bucket.total++
    }
  }
  return buckets
}

/** Finished runs per calendar year, from the first year you finished anything to this year (no gaps). */
export function yearlyHistory(items: Item[], logs: LogEntry[], now: Date): HistoryBucket[] {
  const runs = finishedRuns(items, logs)
  if (runs.length === 0) return []
  const years = runs.map(([, finishedAt]) => Number(finishedAt.slice(0, 4)))
  const first = Math.min(...years)
  const last = Math.max(...years, now.getFullYear())

  const buckets: HistoryBucket[] = []
  for (let y = first; y <= last; y++) buckets.push(emptyBucket(String(y), String(y), y))
  for (const [type, finishedAt] of runs) {
    const bucket = buckets[Number(finishedAt.slice(0, 4)) - first]
    bucket[type]++
    bucket.total++
  }
  return buckets
}

export interface GenreStats {
  genre: string
  /** Finished runs of items with this genre (an item with several genres counts in each). */
  finished: number
  /** Average rating over those runs; undefined when none are rated. */
  averageRating: number | undefined
}

/**
 * Finished runs per genre, optionally for one type only. Each finished run counts once in every
 * genre its item has, so the genre counts add up to more than the number of runs. Runs whose item
 * has no genre are only counted in `finishedWithoutGenre`. Sorted by count, then rating, then name.
 */
export function statsByGenre(
  items: Item[],
  logs: LogEntry[],
  type?: ItemType,
): { genres: GenreStats[]; finishedWithoutGenre: number; finishedTotal: number } {
  const byId = new Map(items.filter((i) => !type || i.type === type).map((i) => [i.id, i]))
  const groups = new Map<string, { name: string; ratings: Array<number | undefined> }>()
  let finishedWithoutGenre = 0
  let finishedTotal = 0

  for (const log of logs) {
    if (!log.finishedAt) continue
    const item = byId.get(log.itemId)
    if (!item) continue
    finishedTotal++
    if (!item.genres?.length) {
      finishedWithoutGenre++
      continue
    }
    for (const genre of new Set(item.genres.map((g) => g.trim()).filter(Boolean))) {
      const key = genre.toLowerCase()
      const group = groups.get(key) ?? { name: genre, ratings: [] }
      group.ratings.push(log.rating)
      groups.set(key, group)
    }
  }

  const genres: GenreStats[] = [...groups.values()].map((g) => ({
    genre: g.name,
    finished: g.ratings.length,
    averageRating: averageRating(g.ratings),
  }))
  genres.sort(
    (a, b) => b.finished - a.finished || (b.averageRating ?? -1) - (a.averageRating ?? -1) || a.genre.localeCompare(b.genre),
  )
  return { genres, finishedWithoutGenre, finishedTotal }
}

export interface SourceStats {
  /** Display name: the spelling used most often for this source. */
  name: string
  /** Items recommended by this source. */
  recommended: number
  /** Of those, how many have been finished at least once. */
  finished: number
  dropped: number
  /** Average rating over the finished runs of these items; undefined when none are rated. */
  averageRating: number | undefined
}

/**
 * Stats per recommendation source ("who do I actually finish and rate highly?").
 * Sources match ignoring case and surrounding spaces ("sam" = " Sam "). Items with no source are
 * only counted in `unattributed`. Sorted by how much they recommended, then by average rating.
 */
export function statsBySource(items: Item[], logs: LogEntry[]): { sources: SourceStats[]; unattributed: number } {
  const finishedRuns = new Map<string, Array<number | undefined>>()
  for (const log of logs) {
    if (!log.finishedAt) continue
    finishedRuns.set(log.itemId, [...(finishedRuns.get(log.itemId) ?? []), log.rating])
  }

  type Group = { spellings: Map<string, number>; items: Item[] }
  const groups = new Map<string, Group>()
  let unattributed = 0
  for (const item of items) {
    const raw = item.recommendedBy?.trim()
    if (!raw) {
      unattributed++
      continue
    }
    const key = raw.toLowerCase()
    const group: Group = groups.get(key) ?? { spellings: new Map(), items: [] }
    group.spellings.set(raw, (group.spellings.get(raw) ?? 0) + 1)
    group.items.push(item)
    groups.set(key, group)
  }

  const sources: SourceStats[] = [...groups.values()].map(({ spellings, items: group }) => {
    const [name] = [...spellings.entries()].sort((a, b) => b[1] - a[1])[0] // most used spelling; first seen wins ties
    return {
      name,
      recommended: group.length,
      finished: group.filter((i) => finishedRuns.has(i.id)).length,
      dropped: group.filter((i) => i.status === 'dropped').length,
      averageRating: averageRating(group.flatMap((i) => finishedRuns.get(i.id) ?? [])),
    }
  })

  sources.sort(
    (a, b) =>
      b.recommended - a.recommended ||
      (b.averageRating ?? -1) - (a.averageRating ?? -1) ||
      a.name.localeCompare(b.name),
  )
  return { sources, unattributed }
}

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
