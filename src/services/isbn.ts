import { db as defaultDb, type ShelfDB } from '../data/db'
import { newId as generateId } from '../data/id'
import { repo as defaultRepo, type Repo } from '../data/repo'
import { normalizeIsbn } from '../domain/isbn'
import type { Item } from '../domain/types'
import { mapOpenLibraryIsbn, type IsbnMatch } from './mappers'

/** Looks an ISBN up. Resolves null when the ISBN is unknown; rejects when the network fails. */
export type IsbnLookup = (isbn: string) => Promise<IsbnMatch | null>

export const lookupIsbn: IsbnLookup = async (isbn) => {
  const res = await fetch(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=details`,
  )
  if (!res.ok) throw new Error(`Open Library responded ${res.status}`)
  return mapOpenLibraryIsbn(await res.json(), isbn)
}

export type ScanOutcome =
  /** Not a valid ISBN (bad checksum, misread, price add-on...). */
  | { kind: 'invalid' }
  /** Already on the shelf; nothing was added. */
  | { kind: 'exists'; item: Item }
  /** Found and added to Want. */
  | { kind: 'added'; item: Item; undo: () => Promise<void> }
  /** Open Library didn't know it: saved as a draft carrying the ISBN. */
  | { kind: 'draft'; item: Item; undo: () => Promise<void> }
  /** Offline or lookup failed: saved to look up later. */
  | { kind: 'queued'; isbn: string }

export interface QueueSummary {
  added: Item[]
  drafts: Item[]
  /** Queued ISBNs that turned out to be on the shelf already. */
  existed: number
  /** Still waiting (the connection dropped again). */
  remaining: number
  /** Removes the items this run created. */
  undo: () => Promise<void>
}

export interface IsbnService {
  /** Handle one scanned or typed ISBN end to end. */
  scan(raw: string): Promise<ScanOutcome>
  /** Look up everything queued while offline. Safe to call any time; concurrent calls do nothing. */
  processQueue(): Promise<QueueSummary>
}

interface Deps {
  db?: ShelfDB
  repo?: Repo
  lookup?: IsbnLookup
  isOnline?: () => boolean
  newId?: () => string
  clock?: () => Date
}

export function createIsbnService({
  db = defaultDb,
  repo = defaultRepo,
  lookup = lookupIsbn,
  isOnline = () => navigator.onLine,
  newId = generateId,
  clock = () => new Date(),
}: Deps = {}): IsbnService {
  let running = false

  /** Existing item for this ISBN (compared as ISBN-13) or, when known, this Open Library work. */
  async function findExisting(isbn: string, externalId?: string): Promise<Item | undefined> {
    const items = await db.items.toArray()
    return items.find((i) => (i.isbn && normalizeIsbn(i.isbn) === isbn) || (externalId && i.externalId === externalId))
  }

  async function enqueue(isbn: string): Promise<ScanOutcome> {
    const already = await db.pendingLookups.filter((p) => p.isbn === isbn).first()
    if (!already) await db.pendingLookups.add({ id: newId(), isbn, createdAt: clock().toISOString() })
    return { kind: 'queued', isbn }
  }

  /** Add the book (or a draft when `match` is null) unless it is already on the shelf. */
  async function create(isbn: string, match: IsbnMatch | null) {
    const existing = await findExisting(isbn, match?.externalId)
    if (existing) return { kind: 'exists' as const, item: existing }

    const item = match
      ? await repo.addItem({
          type: 'book',
          title: match.title,
          creator: match.creator,
          year: match.year,
          isbn,
          coverUrl: match.coverUrl,
          externalId: match.externalId,
        })
      : await repo.addItem({ type: 'book', title: `ISBN ${isbn}`, isbn, isDraft: true })
    const undo = async () => void (await repo.deleteItem(item.id))
    return match ? { kind: 'added' as const, item, undo } : { kind: 'draft' as const, item, undo }
  }

  return {
    async scan(raw) {
      const isbn = normalizeIsbn(raw)
      if (!isbn) return { kind: 'invalid' }

      const existing = await findExisting(isbn)
      if (existing) return { kind: 'exists', item: existing }

      if (!isOnline()) return enqueue(isbn)
      let match: IsbnMatch | null
      try {
        match = await lookup(isbn)
      } catch {
        return enqueue(isbn) // network trouble is not "not found": try again later
      }
      return create(isbn, match)
    },

    async processQueue() {
      const summary: QueueSummary = { added: [], drafts: [], existed: 0, remaining: 0, undo: async () => undefined }
      if (running || !isOnline()) return summary
      running = true
      try {
        const pending = (await db.pendingLookups.toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        for (let i = 0; i < pending.length; i++) {
          let match: IsbnMatch | null
          try {
            match = await lookup(pending[i].isbn)
          } catch {
            summary.remaining = pending.length - i // connection dropped again: keep the rest queued
            break
          }
          const outcome = await create(pending[i].isbn, match)
          await db.pendingLookups.delete(pending[i].id)
          if (outcome.kind === 'added') summary.added.push(outcome.item)
          else if (outcome.kind === 'draft') summary.drafts.push(outcome.item)
          else summary.existed++
        }
      } finally {
        running = false
      }
      const created = [...summary.added, ...summary.drafts]
      summary.undo = async () => {
        for (const item of created) await repo.deleteItem(item.id)
      }
      return summary
    },
  }
}

export const isbnService = createIsbnService()
