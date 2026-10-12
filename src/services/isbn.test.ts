import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ShelfDB } from '../data/db'
import { createRepo } from '../data/repo'
import { createIsbnService, type IsbnLookup, type IsbnService } from './isbn'
import type { IsbnMatch } from './mappers'

const DUNE = '9780441172719'
const EMMA = '9780141439587'
const duneMatch: IsbnMatch = {
  isbn: DUNE,
  title: 'Dune',
  creator: 'Frank Herbert',
  year: 2005,
  coverUrl: 'https://covers.example/dune.jpg',
  externalId: '/works/OL893415W',
}

let db: ShelfDB
let online: boolean
let seq: number
let lookup: ReturnType<typeof vi.fn<IsbnLookup>>
let service: IsbnService

const make = () => {
  const repo = createRepo(db, () => new Date(2026, 9, 1, 12, 0, seq), () => `id-${++seq}`)
  return createIsbnService({
    db,
    repo,
    lookup,
    isOnline: () => online,
    newId: () => `p-${++seq}`,
    clock: () => new Date(2026, 9, 1, 12, 0, seq),
  })
}

beforeEach(() => {
  db = new ShelfDB(`test-${Math.random()}`)
  online = true
  seq = 0
  lookup = vi.fn<IsbnLookup>(async () => null)
  service = make()
})

describe('scan: online', () => {
  it('adds a found book to the Queue with its metadata and the ISBN-13', async () => {
    lookup.mockResolvedValue(duneMatch)
    const r = await service.scan('978-0-441-17271-9')
    expect(r.kind).toBe('added')
    const item = (r as { item: { id: string } }).item
    expect(await db.items.get(item.id)).toMatchObject({
      type: 'book',
      title: 'Dune',
      creator: 'Frank Herbert',
      year: 2005,
      isbn: DUNE,
      externalId: '/works/OL893415W',
      status: 'want',
      isDraft: false,
    })
    expect(lookup).toHaveBeenCalledWith(DUNE)
  })

  it('accepts an ISBN-10 by converting it', async () => {
    lookup.mockResolvedValue(duneMatch)
    expect((await service.scan('0441172717')).kind).toBe('added')
    expect(lookup).toHaveBeenCalledWith(DUNE)
  })

  it('undo removes the added book', async () => {
    lookup.mockResolvedValue(duneMatch)
    const r = await service.scan(DUNE)
    if (r.kind !== 'added') throw new Error('expected added')
    await r.undo()
    expect(await db.items.count()).toBe(0)
  })

  it('rejects things that are not valid ISBNs without any lookup', async () => {
    for (const bad of ['', 'hello', '9780441172718', '5012345678900']) {
      expect((await service.scan(bad)).kind).toBe('invalid')
    }
    expect(lookup).not.toHaveBeenCalled()
    expect(await db.items.count()).toBe(0)
  })

  it('saves a draft carrying the ISBN when Open Library does not know it', async () => {
    lookup.mockResolvedValue(null)
    const r = await service.scan(EMMA)
    expect(r.kind).toBe('draft')
    expect(await db.items.get((r as { item: { id: string } }).item.id)).toMatchObject({
      title: `ISBN ${EMMA}`,
      isbn: EMMA,
      isDraft: true,
      status: 'want',
      type: 'book',
    })
  })

  it('does not add a duplicate: same ISBN, or the same Open Library work found via search', async () => {
    lookup.mockResolvedValue(duneMatch)
    await service.scan(DUNE)
    lookup.mockClear()

    const again = await service.scan(DUNE)
    expect(again.kind).toBe('exists')
    expect(lookup).not.toHaveBeenCalled() // known without asking the network

    // a different edition of the same work, already added earlier through search
    const other = '9780340960196'
    const repo = createRepo(db, () => new Date(), () => `x-${++seq}`)
    await repo.addItem({ type: 'book', title: 'Other', externalId: '/works/OL1W' })
    lookup.mockResolvedValue({ isbn: other, title: 'Other (ed. 2)', externalId: '/works/OL1W' })
    expect((await service.scan(other)).kind).toBe('exists')
    expect(await db.items.count()).toBe(2)
  })

  it('matches an existing item that stored the ISBN-10 form', async () => {
    const repo = createRepo(db, () => new Date(), () => `y-${++seq}`)
    await repo.addItem({ type: 'book', title: 'Dune', isbn: '0441172717' })
    expect((await service.scan(DUNE)).kind).toBe('exists')
  })
})

describe('scan: offline and failures', () => {
  it('queues the ISBN instead of failing when offline, once even if scanned twice', async () => {
    online = false
    expect(await service.scan(DUNE)).toEqual({ kind: 'queued', isbn: DUNE })
    expect(await service.scan(DUNE)).toEqual({ kind: 'queued', isbn: DUNE })
    expect(await db.pendingLookups.count()).toBe(1)
    expect(lookup).not.toHaveBeenCalled()
    expect(await db.items.count()).toBe(0)
  })

  it('queues when the lookup fails (network error is not "not found")', async () => {
    lookup.mockRejectedValue(new Error('Failed to fetch'))
    expect((await service.scan(DUNE)).kind).toBe('queued')
    expect(await db.items.count()).toBe(0)
    expect(await db.pendingLookups.count()).toBe(1)
  })
})

describe('processQueue', () => {
  async function queueTwo() {
    online = false
    await service.scan(DUNE)
    await service.scan(EMMA)
    online = true
  }

  it('does nothing while still offline', async () => {
    await queueTwo()
    online = false
    const s = await service.processQueue()
    expect(s.added).toEqual([])
    expect(await db.pendingLookups.count()).toBe(2)
  })

  it('looks up everything queued, adds books and drafts, and empties the queue', async () => {
    await queueTwo()
    lookup.mockImplementation(async (isbn) => (isbn === DUNE ? duneMatch : null))
    const s = await service.processQueue()
    expect(s.added.map((i) => i.title)).toEqual(['Dune'])
    expect(s.drafts.map((i) => i.title)).toEqual([`ISBN ${EMMA}`])
    expect(s.remaining).toBe(0)
    expect(await db.pendingLookups.count()).toBe(0)
    expect(await db.items.count()).toBe(2)
  })

  it('stops and keeps the rest queued when the connection drops again', async () => {
    await queueTwo()
    lookup.mockResolvedValueOnce(duneMatch).mockRejectedValue(new Error('offline'))
    const s = await service.processQueue()
    expect(s.added).toHaveLength(1)
    expect(s.remaining).toBe(1)
    expect((await db.pendingLookups.toArray()).map((p) => p.isbn)).toEqual([EMMA])
    expect(await db.items.count()).toBe(1)
  })

  it('skips queued ISBNs that are already on the shelf', async () => {
    await queueTwo()
    const repo = createRepo(db, () => new Date(), () => `z-${++seq}`)
    await repo.addItem({ type: 'book', title: 'Dune', isbn: DUNE })
    lookup.mockResolvedValue(null)
    const s = await service.processQueue()
    expect(s.existed).toBe(1)
    expect(s.drafts).toHaveLength(1)
    expect(await db.items.count()).toBe(2)
    expect(await db.pendingLookups.count()).toBe(0)
  })

  it('undo removes what this run created', async () => {
    await queueTwo()
    lookup.mockResolvedValue(duneMatch)
    const s = await service.processQueue()
    expect(await db.items.count()).toBeGreaterThan(0)
    await s.undo()
    expect(await db.items.count()).toBe(0)
  })

  it('concurrent runs do not duplicate anything', async () => {
    await queueTwo()
    lookup.mockImplementation(async (isbn) => ({ ...duneMatch, isbn, title: `Book ${isbn}`, externalId: `/works/${isbn}` }))
    const [a, b] = await Promise.all([service.processQueue(), service.processQueue()])
    expect(a.added.length + b.added.length).toBe(2)
    expect(await db.items.count()).toBe(2)
  })
})
