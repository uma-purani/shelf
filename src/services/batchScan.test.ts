import { describe, expect, it, vi } from 'vitest'
import type { Item } from '../domain/types'
import { describeBatch, scanPhotos } from './batchScan'
import type { ScanOutcome } from './isbn'

const item = (id: string): Item => ({
  id,
  type: 'book',
  title: id,
  status: 'want',
  isDraft: false,
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})
const photo = (name: string) => new Blob([name])

// a "photo" is just a Blob whose text is the ISBN to detect ('' = no barcode, 'boom' = unreadable)
const detect = async (b: Blob) => {
  const text = await b.text()
  if (text === 'boom') throw new Error('bad image')
  return text || undefined
}

describe('scanPhotos', () => {
  it('adds each book, tallies every outcome and keeps going past bad photos', async () => {
    const undone: string[] = []
    const scan = vi.fn(async (isbn: string): Promise<ScanOutcome> => {
      if (isbn === 'A') return { kind: 'added', item: item('a'), undo: async () => void undone.push('a') }
      if (isbn === 'B') return { kind: 'draft', item: item('b'), undo: async () => void undone.push('b') }
      if (isbn === 'C') return { kind: 'exists', item: item('c') }
      if (isbn === 'D') return { kind: 'queued', isbn }
      throw new Error('unexpected')
    })
    const progress: Array<[number, number]> = []
    const s = await scanPhotos(['A', '', 'boom', 'B', 'C', 'D'].map(photo), {
      detect,
      scan,
      onProgress: (d, t) => progress.push([d, t]),
    })

    expect(s.photos).toBe(6)
    expect(s.added.map((i) => i.id)).toEqual(['a'])
    expect(s.drafts.map((i) => i.id)).toEqual(['b'])
    expect(s.existed).toBe(1)
    expect(s.queued).toBe(1)
    expect(s.noBarcode).toBe(2) // the blank photo and the unreadable one
    expect(progress[0]).toEqual([0, 6])
    expect(progress.at(-1)).toEqual([6, 6])

    await s.undo()
    expect(undone).toEqual(['a', 'b'])
  })

  it('processes photos one at a time, in order', async () => {
    const order: string[] = []
    let running = 0
    let maxRunning = 0
    const scan = async (isbn: string): Promise<ScanOutcome> => {
      running++
      maxRunning = Math.max(maxRunning, running)
      await new Promise((r) => setTimeout(r, 5))
      order.push(isbn)
      running--
      return { kind: 'exists', item: item(isbn) }
    }
    await scanPhotos(['1', '2', '3'].map(photo), { detect, scan })
    expect(order).toEqual(['1', '2', '3'])
    expect(maxRunning).toBe(1)
  })

  it('counts a scan that throws as unreadable instead of failing the batch', async () => {
    const scan = vi.fn().mockRejectedValueOnce(new Error('db')).mockResolvedValueOnce({ kind: 'exists', item: item('x') })
    const s = await scanPhotos(['1', '2'].map(photo), { detect, scan })
    expect(s.noBarcode).toBe(1)
    expect(s.existed).toBe(1)
  })

  it('handles an empty selection', async () => {
    const s = await scanPhotos([], { detect, scan: vi.fn() })
    expect(s.photos).toBe(0)
    expect(describeBatch(s)).toBe('Nothing to add.')
  })
})

describe('describeBatch', () => {
  const base = { photos: 0, added: [], drafts: [], existed: 0, queued: 0, noBarcode: 0, undo: async () => undefined }
  it('summarises in one line', () => {
    expect(describeBatch({ ...base, added: [item('a'), item('b'), item('c')], drafts: [item('d')], noBarcode: 2, existed: 1 })).toBe(
      'Added 3 books · 1 not found, saved as a draft · 1 already on your shelf · 2 photos had no readable barcode',
    )
    expect(describeBatch({ ...base, added: [item('a')], queued: 2 })).toBe('Added 1 book · 2 waiting for a connection')
    expect(describeBatch({ ...base, noBarcode: 1 })).toBe('1 photo had no readable barcode')
  })
})
