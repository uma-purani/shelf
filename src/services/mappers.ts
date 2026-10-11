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
}

interface TmdbResult {
  id?: number
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
    })
  }
  return out
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
    })
  }
  return out
}
