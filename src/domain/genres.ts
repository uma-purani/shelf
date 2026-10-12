/**
 * Genres: a small shared vocabulary so "Science Fiction" is one genre whether it came from TMDB,
 * Open Library or your own typing. Genres are separate from free-form tags.
 */

export const KNOWN_GENRES = [
  'Action', 'Adventure', 'Animation', 'Biography', 'Business', 'Classics', 'Comedy', 'Crime', 'Documentary',
  'Drama', 'Family', 'Fantasy', 'Fiction', 'Graphic Novel', 'Historical Fiction', 'History', 'Horror', 'Humor',
  'Kids', 'Music', 'Mystery', 'News', 'Non-fiction', 'Philosophy', 'Poetry', 'Politics', 'Psychology', 'Reality',
  'Romance', 'Science', 'Science Fiction', 'Self-Help', 'Soap', 'Talk Show', 'Thriller', 'War', 'Western', 'Young Adult',
] as const

export const MAX_GENRES_PER_ITEM = 8
const MAX_GENRE_LENGTH = 40

const canonical = new Map(KNOWN_GENRES.map((g) => [g.toLowerCase(), g as string]))

/** One genre, tidied: trimmed, spaces collapsed, known genres in their standard spelling, otherwise Capitalised. */
export function normalizeGenre(raw: string): string {
  const text = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_GENRE_LENGTH)
  if (!text) return ''
  const known = canonical.get(text.toLowerCase())
  if (known) return known
  return text
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Tidy a list of genres: normalised, no blanks, no duplicates (ignoring case), at most 8. */
export function normalizeGenres(list: readonly string[] | undefined): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list ?? []) {
    const genre = normalizeGenre(raw)
    const key = genre.toLowerCase()
    if (!genre || seen.has(key)) continue
    seen.add(key)
    out.push(genre)
    if (out.length === MAX_GENRES_PER_ITEM) break
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// TMDB (movies and shows): genres arrive as stable numeric ids
// ---------------------------------------------------------------------------------------------

export const TMDB_GENRES: Record<number, string[]> = {
  28: ['Action'],
  12: ['Adventure'],
  16: ['Animation'],
  35: ['Comedy'],
  80: ['Crime'],
  99: ['Documentary'],
  18: ['Drama'],
  10751: ['Family'],
  14: ['Fantasy'],
  36: ['History'],
  27: ['Horror'],
  10402: ['Music'],
  9648: ['Mystery'],
  10749: ['Romance'],
  878: ['Science Fiction'],
  53: ['Thriller'],
  10752: ['War'],
  37: ['Western'],
  // TV-only genres, several of which TMDB combines
  10759: ['Action', 'Adventure'],
  10762: ['Kids'],
  10763: ['News'],
  10764: ['Reality'],
  10765: ['Science Fiction', 'Fantasy'],
  10766: ['Soap'],
  10767: ['Talk Show'],
  10768: ['War', 'Politics'],
}

export function genresFromTmdbIds(ids: readonly number[] | undefined): string[] {
  return normalizeGenres((ids ?? []).flatMap((id) => TMDB_GENRES[id] ?? []))
}

// ---------------------------------------------------------------------------------------------
// Open Library (books): subjects are free text, hundreds per book, so map them onto our vocabulary
// ---------------------------------------------------------------------------------------------

/** First matching rules win, so the most specific genres come first. */
const SUBJECT_RULES: Array<[genre: string, test: RegExp]> = [
  ['Science Fiction', /science fiction|sci-?fi\b|dystopi|cyberpunk|space opera|time travel|extraterrestrial|life on other planets/],
  ['Fantasy', /fantasy|magic|wizard|dragons?\b/],
  ['Mystery', /mystery|detective|whodunit/],
  ['Thriller', /thriller|suspense|espionage|spy stories|conspirac/],
  ['Crime', /\bcrime|murder|serial killers?/],
  ['Horror', /horror|ghost|vampire|haunted|zombie|supernatural/],
  ['Romance', /romance|love stor(y|ies)/],
  ['Historical Fiction', /historical (fiction|novels?)/],
  ['Adventure', /adventure/],
  ['Humor', /humou?r|satire|comic novels?|comedy/],
  ['Young Adult', /young adult|teenage|juvenile fiction/],
  ['Classics', /^classics?$|classic (literature|fiction)/],
  ['Graphic Novel', /graphic novels?|\bcomics?\b|manga/],
  ['Biography', /biograph|memoirs?\b|autobiograph/],
  ['History', /(^|\W)history(\W|$)|world war|civil war/],
  ['Science', /^science$|popular works|physics|biology|astronomy|evolution|cosmology|neuroscience|mathematics/],
  ['Psychology', /psycholog/],
  ['Philosophy', /philosoph/],
  ['Self-Help', /self-help|self-improvement|personal development/],
  ['Business', /business|economics|entrepreneur/],
  ['Politics', /politic|democracy/],
  ['Poetry', /poetry|poems/],
]

/** Broad genres for a book from its Open Library subject headings (at most 3, most specific first). */
export function genresFromSubjects(subjects: readonly string[] | undefined, max = 3): string[] {
  const list = (subjects ?? []).map((s) => s.toLowerCase())
  const found: string[] = []
  for (const [genre, test] of SUBJECT_RULES) {
    if (list.some((s) => test.test(s))) found.push(genre)
    if (found.length === max) break
  }
  // Nothing more specific: at least say whether it is fiction.
  if (found.length === 0 && list.some((s) => /\bfiction\b/.test(s))) return ['Fiction']
  return found
}
