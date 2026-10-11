import type { Item, Quote } from './types'

export interface NewQuoteInput {
  itemId: string
  text: string
  /** Page, chapter, episode or timestamp. */
  location?: string
}

/** Build a quote. Only the text is required; blank location is dropped. */
export function createQuote(input: NewQuoteInput, now: Date, id: string): Quote {
  const text = input.text.trim()
  if (!text) throw new Error('Quote text is required')
  const location = input.location?.trim()
  return {
    id,
    itemId: input.itemId,
    text,
    ...(location ? { location } : {}),
    createdAt: now.toISOString(),
  }
}

export interface QuoteEdit {
  text?: string
  /** Blank clears it. */
  location?: string
}

/** Apply an edit to a quote. The text can't be blanked; a blank location clears the field. */
export function editQuote(quote: Quote, edit: QuoteEdit): Quote {
  const next: Quote = { ...quote }
  if (edit.text !== undefined) {
    const text = edit.text.trim()
    if (!text) throw new Error('Quote text is required')
    next.text = text
  }
  if (edit.location !== undefined) {
    const location = edit.location.trim()
    if (location) next.location = location
    else delete next.location
  }
  return next
}

export interface QuoteWithItem {
  quote: Quote
  item: Item
}

/**
 * All quotes joined to their items, newest first, filtered by a free-text query.
 * Every word of the query must appear somewhere in the quote text, its location,
 * or the item's title or creator (case-insensitive). A blank query returns everything.
 * Quotes whose item no longer exists are left out.
 */
export function searchQuotes(quotes: Quote[], items: Item[], query: string): QuoteWithItem[] {
  const byId = new Map(items.map((i) => [i.id, i]))
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)

  const out: QuoteWithItem[] = []
  for (const quote of quotes) {
    const item = byId.get(quote.itemId)
    if (!item) continue
    const haystack = [quote.text, quote.location, item.title, item.creator].filter(Boolean).join(' ').toLowerCase()
    if (terms.every((t) => haystack.includes(t))) out.push({ quote, item })
  }
  return out.sort((a, b) => b.quote.createdAt.localeCompare(a.quote.createdAt))
}
