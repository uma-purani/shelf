import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { ShelfDB } from '../data/db'
import {
  diagnose,
  formatBytes,
  inspectRawShelf,
  readRawSnapshot,
  type DiagnosticsReport,
} from './storageDiagnostics'

const item = (id: string) => ({
  id,
  type: 'book' as const,
  title: id,
  status: 'want' as const,
  isDraft: false,
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

describe('formatBytes', () => {
  it('reads like a person would', () => {
    expect(formatBytes(undefined)).toBe('unknown')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(24 * 1024 * 1024)).toBe('24.0 MB')
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.0 GB')
  })
})

describe('raw database inspection', () => {
  it('reports what is stored without going through the app layer', async () => {
    const name = `diag-${Math.random()}`
    const db = new ShelfDB(name)
    await db.items.bulkPut([item('a'), item('b')])
    await db.logs.put({ id: 'l', itemId: 'a', createdAt: '2026-01-01T00:00:00.000Z' })
    db.close()

    const raw = await inspectRawShelf(indexedDB, name)
    expect(raw.status).toBe('opened')
    if (raw.status !== 'opened') return
    expect(Object.fromEntries(raw.stores.map((s) => [s.name, s.count]))).toMatchObject({ items: 2, logs: 1, quotes: 0 })

    const snap = await readRawSnapshot(indexedDB, name)
    expect(snap.items.map((i) => i.id).sort()).toEqual(['a', 'b'])
    expect(snap.logs).toHaveLength(1)
  })

  it('says "missing" for a database that does not exist, and does not create it by looking', async () => {
    const factory = new IDBFactory() // a fresh, empty browser profile
    expect(await inspectRawShelf(factory, 'shelf')).toEqual({ status: 'missing' })
    expect((await factory.databases()).map((d) => d.name)).not.toContain('shelf')
    await expect(readRawSnapshot(factory, 'shelf')).rejects.toThrow(/no Shelf database/)
    expect((await factory.databases()).map((d) => d.name)).not.toContain('shelf')
  })
})

describe('diagnose', () => {
  const base: DiagnosticsReport = {
    origin: 'https://shelf.example',
    secure: true,
    standalone: false,
    persisted: true,
    estimate: null,
    databases: [{ name: 'shelf', version: 10 }],
    shelf: { status: 'opened', version: 10, stores: [{ name: 'items', count: 12 }, { name: 'logs', count: 20 }] },
    app: { ok: true, items: 12, logs: 20, quotes: 3 },
    serviceWorker: { registered: true, controlling: true, state: 'activated' },
    caches: [{ name: 'cover-images', entries: 9 }],
  }

  it('is reassuring when the app can see the data', () => {
    const v = diagnose(base)
    expect(v.tone).toBe('good')
    expect(v.headline).toMatch(/12 items/)
  })

  it('flags data that is stored but unreadable by the app, and points at the rescue copy', () => {
    const v = diagnose({ ...base, app: { ok: false, error: 'VersionError' } })
    expect(v.tone).toBe('bad')
    expect(v.headline).toMatch(/still stored.*can't open/)
    expect(v.details.join(' ')).toMatch(/rescue copy/)
    expect(v.details.join(' ')).toMatch(/VersionError/)
  })

  it('explains a missing database, noting that the rest of the site was not cleared', () => {
    const v = diagnose({ ...base, shelf: { status: 'missing' }, databases: [], app: { ok: true, items: 0, logs: 0, quotes: 0 } })
    expect(v.tone).toBe('bad')
    expect(v.headline).toMatch(/no Shelf database/)
    expect(v.details.join(' ')).toMatch(/different address/)
    expect(v.details.join(' ')).toMatch(/cover-images: 9/)
    expect(v.details.join(' ')).toMatch(/not cleared as a whole/)
  })

  it('treats an empty database as the likely sign of lost or relocated data, and says why it exists', () => {
    const v = diagnose({ ...base, shelf: { status: 'opened', version: 10, stores: [{ name: 'items', count: 0 }] }, app: { ok: true, items: 0, logs: 0, quotes: 0 } })
    expect(v.tone).toBe('bad')
    expect(v.headline).toMatch(/empty/)
    expect(v.details.join(' ')).toMatch(/creates an empty database the first time/)
    expect(v.details.join(' ')).toMatch(/different address/)
    expect(v.details.join(' ')).toMatch(/cover-images: 9/) // the rest of the site survived
  })

  it('warns when the browser has not promised to keep the data, or the address is insecure', () => {
    const v = diagnose({ ...base, persisted: false, secure: false })
    expect(v.tone).toBe('good')
    expect(v.details.join(' ')).toMatch(/not promised to keep/)
    expect(v.details.join(' ')).toMatch(/not secure/)
  })
})
