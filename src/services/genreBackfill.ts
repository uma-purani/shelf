import { genresFromSubjects, genresFromTmdbIds } from '../domain/genres'
import type { Item } from '../domain/types'
import { repo as defaultRepo, type Repo } from '../data/repo'
import { db as defaultDb, type ShelfDB } from '../data/db'

/** Where to ask for an item's genres, or null when it has no external id to ask about (added by hand). */
export type GenreTarget = { source: 'tmdb'; url: string } | { source: 'openlibrary'; url: string }

export function genreTarget(item: Item): GenreTarget | null {
  const id = item.externalId
  if (!id) return null
  const tmdb = /^(movie|tv):(\d+)$/.exec(id)
  if (tmdb) return { source: 'tmdb', url: `/api/tmdb?path=${tmdb[1]}/${tmdb[2]}` }
  if (/^\/works\/OL\d+W$/.test(id)) return { source: 'openlibrary', url: `https://openlibrary.org${id}.json` }
  return null
}

/** Pull genres out of a TMDB detail response or an Open Library work. */
export function genresFromResponse(target: GenreTarget, json: unknown): string[] {
  if (target.source === 'tmdb') {
    const genres = (json as { genres?: Array<{ id?: number }> } | null)?.genres ?? []
    return genresFromTmdbIds(genres.map((g) => g.id).filter((id): id is number => typeof id === 'number'))
  }
  const subjects = (json as { subjects?: unknown } | null)?.subjects
  return genresFromSubjects(Array.isArray(subjects) ? subjects.filter((s): s is string => typeof s === 'string') : [])
}

export class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`)
  }
}

export type FetchJson = (url: string) => Promise<unknown>

const fetchJson: FetchJson = async (url) => {
  const res = await fetch(url)
  if (!res.ok) throw new HttpError(res.status)
  return res.json()
}

export interface BackfillResult {
  /** Items that got genres. */
  updated: number
  /** Looked up fine, but the source has no usable genre for them. */
  noGenres: number
  /** Couldn't be looked up (network or server trouble). */
  failed: number
  /** Stopped early because the network kept failing. */
  stoppedEarly: boolean
  undo: () => Promise<void>
}

/** After this many failures in a row (offline, say), stop instead of trying every remaining item. */
const MAX_CONSECUTIVE_FAILURES = 3

export interface GenreBackfill {
  /** How many items lack genres, and how many of those can be looked up. */
  survey(): Promise<{ missing: number; lookupable: number }>
  run(onProgress?: (done: number, total: number) => void): Promise<BackfillResult>
}

export function createGenreBackfill({
  db = defaultDb,
  repo = defaultRepo,
  getJson = fetchJson,
  clock = () => new Date(),
}: { db?: ShelfDB; repo?: Repo; getJson?: FetchJson; clock?: () => Date } = {}): GenreBackfill {
  const candidates = async () => (await db.items.toArray()).filter((i) => !i.genres?.length)

  return {
    async survey() {
      const missing = await candidates()
      return { missing: missing.length, lookupable: missing.filter((i) => genreTarget(i)).length }
    },

    async run(onProgress) {
      const todo = (await candidates()).filter((i) => genreTarget(i))
      const result: BackfillResult = { updated: 0, noGenres: 0, failed: 0, stoppedEarly: false, undo: async () => undefined }
      const undos: Array<() => Promise<void>> = []
      let streak = 0

      for (let i = 0; i < todo.length; i++) {
        onProgress?.(i, todo.length)
        const item = todo[i]
        const target = genreTarget(item)!
        let genres: string[]
        try {
          genres = genresFromResponse(target, await getJson(target.url))
          streak = 0
        } catch (e) {
          if (e instanceof HttpError && e.status === 404) {
            result.noGenres++ // the source doesn't know this one: nothing to find
            streak = 0
            continue
          }
          result.failed++
          if (++streak >= MAX_CONSECUTIVE_FAILURES) {
            result.stoppedEarly = true
            break
          }
          continue
        }
        if (genres.length === 0) {
          result.noGenres++
          continue
        }
        const fresh = await repo.getItem(item.id) // may have been edited while we were fetching
        if (!fresh || fresh.genres?.length) continue
        const { undo } = await repo.replaceItem({ ...fresh, genres, updatedAt: clock().toISOString() })
        undos.push(undo)
        result.updated++
      }
      onProgress?.(todo.length, todo.length)

      result.undo = async () => {
        for (const undo of undos.reverse()) await undo()
      }
      return result
    },
  }
}

export const genreBackfill = createGenreBackfill()
