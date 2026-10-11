import type { Item } from './types'

/** Metadata fields a search result can fill in on a draft. */
export interface MetadataMatch {
  type: Item['type']
  title: string
  creator?: string
  year?: number
  isbn?: string
  coverUrl?: string
  externalId?: string
}

/**
 * Fill a draft in from a metadata match. Keeps what the user owns (id, status, recommender,
 * tags, createdAt) and takes everything descriptive from the match; the draft flag clears.
 */
export function matchDraft(draft: Item, match: MetadataMatch, now: Date): Item {
  const { creator, year, isbn, coverUrl, externalId, ...rest } = draft
  void creator, void year, void coverUrl, void externalId
  return {
    ...rest,
    // A scanned ISBN is more reliable than whatever the lookup returned; keep it if we had one.
    ...(isbn ? { isbn } : {}),
    type: match.type,
    title: match.title,
    ...(match.creator ? { creator: match.creator } : {}),
    ...(match.year !== undefined ? { year: match.year } : {}),
    ...(match.isbn && !isbn ? { isbn: match.isbn } : {}),
    ...(match.coverUrl ? { coverUrl: match.coverUrl } : {}),
    ...(match.externalId ? { externalId: match.externalId } : {}),
    isDraft: false,
    updatedAt: now.toISOString(),
  }
}

/** Accept a draft as it is: no longer needs details. */
export function confirmDraft(draft: Item, now: Date): Item {
  return { ...draft, isDraft: false, updatedAt: now.toISOString() }
}

/** What to prefill the metadata search with: the ISBN for placeholder scan drafts, else the title. */
export function searchTermFor(draft: Item): string {
  if (draft.isbn && /^isbn\b/i.test(draft.title)) return draft.isbn
  return draft.title
}
