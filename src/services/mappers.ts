import { genresFromSubjects, genresFromTmdbIds } from '../domain/genres'
import type { NewItemInput } from '../domain/items'

/** A search hit, ready to be added as an item. `key` is unique per source+id for React lists. */
export interface SearchResult extends NewItemInput {
  key: string
  externalId: string
}

interface OpenLibraryDoc {
  key?: string
  title?: string
  author_name?: string[]
  first_publish_year?: number
  cover_i?: number
  isbn?: string[]
  subject?: string[]
}

interface TmdbResult {
  id?: number
  genre_ids?: number[]
  media_type?: string
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  poster_path?: string | null
}

export const OPEN_LIBRARY_COVER = (coverId: number) => `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
export const TMDB_POSTER = (path: string) => `https://image.tmdb.org/t/p/w185${path}`

export function mapOpenLibrary(json: unknown): SearchResult[] {
  const docs = (json as { docs?: OpenLibraryDoc[] } | null)?.docs
  if (!Array.isArray(docs)) return []
  const out: SearchResult[] = []
  for (const d of docs) {
    if (!d.key || !d.title) continue
    const isbn = d.isbn?.find((i) => i.length === 13) ?? d.isbn?.[0]
    out.push({
      key: `ol:${d.key}`,
      type: 'book',
      title: d.title,
      creator: d.author_name?.slice(0, 2).join(', ') || undefined,
      year: d.first_publish_year,
      isbn,
      coverUrl: d.cover_i ? OPEN_LIBRARY_COVER(d.cover_i) : undefined,
      externalId: d.key,
      genres: orUndefined(genresFromSubjects(d.subject)),
    })
  }
  return out
}

const orUndefined = <T,>(list: T[]) => (list.length > 0 ? list : undefined)

/** What an ISBN lookup found about a book. */
export interface IsbnMatch {
  isbn: string
  title: string
  creator?: string
  year?: number
  coverUrl?: string
  /** The Open Library *work* key, the same id search results use, so scan and search dedupe. */
  externalId?: string
  genres?: string[]
}

interface OpenLibraryDetails {
  details?: {
    title?: string
    subjects?: Array<string | { name?: string }>
    authors?: Array<{ name?: string }>
    publish_date?: string
    covers?: number[]
    works?: Array<{ key?: string }>
  }
}

/**
 * Maps an Open Library Books API response (`jscmd=details`) for one ISBN.
 * Returns null when Open Library does not know the ISBN (it answers with `{}`).
 */
export function mapOpenLibraryIsbn(json: unknown, isbn: string): IsbnMatch | null {
  const entry = (json as Record<string, OpenLibraryDetails> | null)?.[`ISBN:${isbn}`]
  const d = entry?.details
  const title = d?.title?.trim()
  if (!d || !title) return null

  const names = (d.authors ?? []).map((a) => a.name?.trim()).filter((n): n is string => !!n)
  const year = Number.parseInt(d.publish_date?.match(/\b(1[5-9]\d{2}|20\d{2})\b/)?.[1] ?? '', 10)
  return {
    isbn,
    title,
    creator: names.slice(0, 2).join(', ') || undefined,
    year: Number.isNaN(year) ? undefined : year,
    coverUrl: d.covers?.[0] ? OPEN_LIBRARY_COVER(d.covers[0]) : undefined,
    externalId: d.works?.[0]?.key,
    genres: orUndefined(genresFromSubjects((d.subjects ?? []).map((s) => (typeof s === 'string' ? s : (s.name ?? ''))))),
  }
}

/** Maps TMDB `search/multi` results, dropping people and anything without a title. */
export function mapTmdb(json: unknown): SearchResult[] {
  const results = (json as { results?: TmdbResult[] } | null)?.results
  if (!Array.isArray(results)) return []
  const out: SearchResult[] = []
  for (const r of results) {
    if ((r.media_type !== 'movie' && r.media_type !== 'tv') || r.id === undefined) continue
    const title = r.title ?? r.name
    if (!title) continue
    const year = Number.parseInt((r.release_date ?? r.first_air_date ?? '').slice(0, 4), 10)
    const externalId = `${r.media_type}:${r.id}`
    out.push({
      key: `tmdb:${externalId}`,
      type: r.media_type === 'movie' ? 'movie' : 'show',
      title,
      year: Number.isNaN(year) ? undefined : year,
      coverUrl: r.poster_path ? TMDB_POSTER(r.poster_path) : undefined,
      externalId,
      genres: orUndefined(genresFromTmdbIds(r.genre_ids)),
    })
  }
  return out
}
