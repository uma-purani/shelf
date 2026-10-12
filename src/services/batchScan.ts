import type { Item } from '../domain/types'
import type { ScanOutcome } from './isbn'

export interface BatchSummary {
  photos: number
  added: Item[]
  /** ISBN not found: saved as drafts carrying the ISBN. */
  drafts: Item[]
  existed: number
  /** Offline or lookup failed: queued to look up later. */
  queued: number
  /** Photos where no valid ISBN barcode was found (or the photo couldn't be read). */
  noBarcode: number
  /** Removes everything this batch created. */
  undo: () => Promise<void>
}

interface Deps {
  /** Read an ISBN-13 from a photo; undefined when there is none. May throw for unreadable images. */
  detect: (photo: Blob) => Promise<string | undefined>
  scan: (isbn: string) => Promise<ScanOutcome>
  onProgress?: (done: number, total: number) => void
}

/**
 * Read several barcode photos (for example taken at a bookstore) and add each book to the Queue.
 * One at a time, so lookups stay polite and results stay in order. A photo that can't be read
 * never stops the rest. The same book in two photos is only added once.
 */
export async function scanPhotos(photos: Blob[], { detect, scan, onProgress }: Deps): Promise<BatchSummary> {
  const summary: BatchSummary = {
    photos: photos.length,
    added: [],
    drafts: [],
    existed: 0,
    queued: 0,
    noBarcode: 0,
    undo: async () => undefined,
  }
  const undos: Array<() => Promise<void>> = []

  for (let i = 0; i < photos.length; i++) {
    onProgress?.(i, photos.length)
    let isbn: string | undefined
    try {
      isbn = await detect(photos[i])
    } catch {
      isbn = undefined
    }
    if (!isbn) {
      summary.noBarcode++
      continue
    }
    try {
      const outcome = await scan(isbn)
      if (outcome.kind === 'added') {
        summary.added.push(outcome.item)
        undos.push(outcome.undo)
      } else if (outcome.kind === 'draft') {
        summary.drafts.push(outcome.item)
        undos.push(outcome.undo)
      } else if (outcome.kind === 'exists') summary.existed++
      else if (outcome.kind === 'queued') summary.queued++
      else summary.noBarcode++ // 'invalid' can't normally happen after detect, but count it honestly
    } catch {
      summary.noBarcode++
    }
  }
  onProgress?.(photos.length, photos.length)

  summary.undo = async () => {
    for (const undo of undos) await undo()
  }
  return summary
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** One line for the toast, e.g. "Added 3 books · 1 not found, saved as a draft · 2 photos had no readable barcode". */
export function describeBatch(s: BatchSummary): string {
  const parts: string[] = []
  if (s.added.length) parts.push(`Added ${plural(s.added.length, 'book', 'books')}`)
  if (s.drafts.length) parts.push(`${s.drafts.length} not found, saved as ${s.drafts.length === 1 ? 'a draft' : 'drafts'}`)
  if (s.queued) parts.push(`${s.queued} waiting for a connection`)
  if (s.existed) parts.push(`${s.existed} already on your shelf`)
  if (s.noBarcode) parts.push(`${plural(s.noBarcode, 'photo', 'photos')} had no readable barcode`)
  return parts.length ? parts.join(' · ') : 'Nothing to add.'
}
