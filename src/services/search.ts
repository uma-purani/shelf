import { mapOpenLibrary, mapTmdb, type SearchResult } from './mappers'

export interface SearchOutcome {
  books: SearchResult[]
  screen: SearchResult[]
  /** Sources that failed (network, proxy not configured...). Results from the others still show. */
  failed: Array<'books' | 'screen'>
}

const MAX_BOOKS = 8
const MAX_SCREEN = 12
const CACHE_LIMIT = 50
const cache = new Map<string, SearchOutcome>()

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const searchBooks = async (q: string, signal: AbortSignal) =>
  mapOpenLibrary(
    await getJson(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=${MAX_BOOKS}&fields=key,title,author_name,first_publish_year,cover_i,isbn`,
      signal,
    ),
  ).slice(0, MAX_BOOKS)

const searchScreen = async (q: string, signal: AbortSignal) =>
  mapTmdb(await getJson(`/api/tmdb?path=search/multi&query=${encodeURIComponent(q)}`, signal)).slice(0, MAX_SCREEN)

export const normalizeQuery = (q: string) => q.trim().toLowerCase().replace(/\s+/g, ' ')

/** Search Open Library (books) and TMDB (movies/shows, via our proxy) in parallel, with an in-memory cache. */
export async function searchAll(rawQuery: string, signal: AbortSignal): Promise<SearchOutcome> {
  const q = normalizeQuery(rawQuery)
  const cached = cache.get(q)
  if (cached) return cached

  const [books, screen] = await Promise.allSettled([searchBooks(q, signal), searchScreen(q, signal)])
  signal.throwIfAborted()

  const outcome: SearchOutcome = {
    books: books.status === 'fulfilled' ? books.value : [],
    screen: screen.status === 'fulfilled' ? screen.value : [],
    failed: [
      ...(books.status === 'rejected' ? (['books'] as const) : []),
      ...(screen.status === 'rejected' ? (['screen'] as const) : []),
    ],
  }
  // Only cache complete answers, so a transient failure is retried on the next keystroke.
  if (outcome.failed.length === 0) {
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!)
    cache.set(q, outcome)
  }
  return outcome
}
