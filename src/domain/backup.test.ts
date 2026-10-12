import { describe, expect, it } from 'vitest'
import {
  backupFileName,
  buildBackup,
  daysSince,
  describeImport,
  parseBackup,
  planImport,
  shouldShowBackupReminder,
  type Snapshot,
} from './backup'
import type { Item, LogEntry, Quote } from './types'

const iso = (d: string) => `${d}T12:00:00.000Z`
const item = (id: string, updated = '2026-10-01', extra: Partial<Item> = {}): Item => ({
  id,
  type: 'book',
  title: `Title ${id}`,
  status: 'want',
  isDraft: false,
  tags: [],
  createdAt: iso('2026-01-01'),
  updatedAt: iso(updated),
  ...extra,
})
const log = (id: string, itemId: string, extra: Partial<LogEntry> = {}): LogEntry => ({
  id,
  itemId,
  createdAt: iso('2026-02-01'),
  ...extra,
})
const quote = (id: string, itemId: string, extra: Partial<Quote> = {}): Quote => ({
  id,
  itemId,
  text: `quote ${id}`,
  createdAt: iso('2026-03-01'),
  ...extra,
})
const snap = (p: Partial<Snapshot> = {}): Snapshot => ({ items: [], logs: [], quotes: [], pendingLookups: [], ...p })

const now = new Date(2026, 9, 15, 12)

describe('buildBackup / parseBackup', () => {
  it('round-trips a snapshot', () => {
    const s = snap({
      items: [item('a', '2026-10-01', { creator: 'Z', year: 1999, recommendedBy: 'Sam', tags: ['x'], genres: ['Mystery', 'Crime'] })],
      logs: [log('l1', 'a', { rating: 4.5, finishedAt: '2026-10-02', caughtUp: true })],
      quotes: [quote('q1', 'a', { location: 'p. 3' })],
      pendingLookups: [{ id: 'p1', isbn: '9780441172719', createdAt: iso('2026-10-01') }],
    })
    const file = buildBackup(s, now)
    expect(file).toMatchObject({ app: 'shelf', version: 1 })
    const parsed = parseBackup(JSON.stringify(file))
    expect(parsed).toEqual({ ok: true, snapshot: s })
  })

  it('names the file by local date', () => {
    expect(backupFileName(now)).toBe('shelf-backup-2026-10-15.json')
  })

  it('rejects things that are not a Shelf backup', () => {
    for (const text of ['not json', '[]', '{}', '{"app":"other","version":1}', 'null']) {
      const r = parseBackup(text)
      expect(r.ok).toBe(false)
    }
  })

  it('rejects a missing or newer version', () => {
    expect(parseBackup(JSON.stringify({ app: 'shelf', items: [], logs: [], quotes: [] })).ok).toBe(false)
    const newer = parseBackup(JSON.stringify({ app: 'shelf', version: 99, items: [], logs: [], quotes: [] }))
    expect(newer).toMatchObject({ ok: false })
    expect((newer as { error: string }).error).toMatch(/newer version/)
  })

  it('rejects a file with a missing list, pointing at it', () => {
    const r = parseBackup(JSON.stringify({ app: 'shelf', version: 1, items: [], logs: [] }))
    expect(r).toMatchObject({ ok: false })
    expect((r as { error: string }).error).toMatch(/quotes/)
  })

  it('rejects the whole file on one bad record, naming where', () => {
    const bad = buildBackup(snap({ items: [item('a'), { ...item('b'), status: 'watching' as never }] }), now)
    const r = parseBackup(JSON.stringify(bad))
    expect(r).toMatchObject({ ok: false })
    expect((r as { error: string }).error).toMatch(/items\[1\] \(status\)/)

    const badRating = buildBackup(snap({ items: [item('a')], logs: [log('l', 'a', { rating: 3.3 })] }), now)
    expect((parseBackup(JSON.stringify(badRating)) as { error: string }).error).toMatch(/logs\[0\] \(rating\)/)
  })

  it('drops unknown fields so nothing unexpected reaches the database', () => {
    const file = buildBackup(snap({ items: [{ ...item('a'), evil: 'x', __proto__x: 1 } as never] }), now)
    const parsed = parseBackup(JSON.stringify(file))
    expect(parsed.ok && 'evil' in parsed.snapshot.items[0]).toBe(false)
  })

  it('treats pendingLookups as optional and keeps the newest of duplicate ids', () => {
    const file = {
      app: 'shelf',
      version: 1,
      items: [item('a', '2026-01-01', { title: 'old' }), item('a', '2026-05-01', { title: 'new' })],
      logs: [],
      quotes: [],
    }
    const r = parseBackup(JSON.stringify(file))
    expect(r.ok && r.snapshot.items).toHaveLength(1)
    expect(r.ok && r.snapshot.items[0].title).toBe('new')
    expect(r.ok && r.snapshot.pendingLookups).toEqual([])
  })
})

describe('planImport', () => {
  it('adds records that are new', () => {
    const plan = planImport(snap(), snap({ items: [item('a')], logs: [log('l', 'a')], quotes: [quote('q', 'a')] }))
    expect(plan.summary.items).toEqual({ added: 1, updated: 0, unchanged: 0 })
    expect(plan.summary.logs.added).toBe(1)
    expect(plan.summary.quotes.added).toBe(1)
    expect(plan.addedIds.items).toEqual(['a'])
  })

  it('lets the newer edit win, per record', () => {
    const local = snap({ items: [item('a', '2026-10-01', { title: 'local' }), item('b', '2026-10-09', { title: 'local-b' })] })
    const incoming = snap({ items: [item('a', '2026-10-05', { title: 'incoming' }), item('b', '2026-10-02', { title: 'incoming-b' })] })
    const plan = planImport(local, incoming)
    expect(plan.writes.items.map((i) => i.title)).toEqual(['incoming'])
    expect(plan.previous.items.map((i) => i.title)).toEqual(['local'])
    expect(plan.summary.items).toEqual({ added: 0, updated: 1, unchanged: 1 })
  })

  it('keeps the local copy on an exact tie', () => {
    const plan = planImport(snap({ items: [item('a', '2026-10-01', { title: 'local' })] }), snap({ items: [item('a', '2026-10-01', { title: 'incoming' })] }))
    expect(plan.writes.items).toEqual([])
    expect(plan.summary.items.unchanged).toBe(1)
  })

  it('compares logs and quotes by updatedAt, falling back to createdAt', () => {
    const local = snap({
      items: [item('a')],
      logs: [log('l1', 'a', { notes: 'local' }), log('l2', 'a', { notes: 'local2', updatedAt: iso('2026-10-09') })],
      quotes: [quote('q1', 'a', { text: 'local' })],
    })
    const incoming = snap({
      items: [item('a')],
      logs: [
        log('l1', 'a', { notes: 'incoming', updatedAt: iso('2026-10-05') }), // newer than createdAt fallback
        log('l2', 'a', { notes: 'incoming2', updatedAt: iso('2026-10-02') }), // older
      ],
      quotes: [quote('q1', 'a', { text: 'incoming', updatedAt: iso('2026-03-02') })],
    })
    const plan = planImport(local, incoming)
    expect(plan.writes.logs.map((l) => l.notes)).toEqual(['incoming'])
    expect(plan.writes.quotes.map((q) => q.text)).toEqual(['incoming'])
    expect(plan.summary.logs).toEqual({ added: 0, updated: 1, unchanged: 1 })
  })

  it('never deletes: records only on this device are left alone', () => {
    const plan = planImport(snap({ items: [item('mine')], logs: [log('ml', 'mine')] }), snap({ items: [item('theirs')] }))
    expect(plan.writes.items.map((i) => i.id)).toEqual(['theirs'])
    expect(plan.previous.items).toEqual([])
  })

  it('skips logs and quotes whose item exists nowhere, but accepts ones for local items', () => {
    const local = snap({ items: [item('mine')] })
    const incoming = snap({
      items: [item('theirs')],
      logs: [log('l1', 'theirs'), log('l2', 'mine'), log('l3', 'ghost')],
      quotes: [quote('q1', 'ghost')],
    })
    const plan = planImport(local, incoming)
    expect(plan.writes.logs.map((l) => l.id)).toEqual(['l1', 'l2'])
    expect(plan.summary.skippedOrphans).toBe(2)
  })

  it('importing the same file twice changes nothing the second time', () => {
    const s = snap({ items: [item('a')], logs: [log('l', 'a')], quotes: [quote('q', 'a')] })
    const first = planImport(snap(), s)
    const applied = snap({ items: first.writes.items, logs: first.writes.logs, quotes: first.writes.quotes })
    const second = planImport(applied, s)
    expect(second.writes).toEqual(snap())
    expect(describeImport(second)).toMatch(/Nothing new/)
  })

  it('describes what happened', () => {
    const plan = planImport(
      snap({ items: [item('a', '2026-01-01')] }),
      snap({ items: [item('a', '2026-10-01'), item('b')], logs: [log('l', 'b')], quotes: [quote('q', 'b')] }),
    )
    expect(describeImport(plan)).toBe('Imported 1 new item, 1 updated, 1 log entry, 1 quote.')
  })
})

describe('shouldShowBackupReminder', () => {
  const day = 24 * 60 * 60 * 1000
  const ago = (days: number) => new Date(now.getTime() - days * day).toISOString()

  it('shows when the last export is more than 30 days old, not at exactly 30', () => {
    expect(shouldShowBackupReminder({ lastBackupAt: ago(31), itemCount: 0, now })).toBe(true)
    expect(shouldShowBackupReminder({ lastBackupAt: ago(30), itemCount: 0, now })).toBe(false)
    expect(shouldShowBackupReminder({ lastBackupAt: ago(2), itemCount: 500, now })).toBe(false)
  })

  it('with no export ever, needs at least 10 items', () => {
    expect(shouldShowBackupReminder({ itemCount: 9, now })).toBe(false)
    expect(shouldShowBackupReminder({ itemCount: 10, now })).toBe(true)
  })

  it('stays hidden for a week after being dismissed, then returns', () => {
    expect(shouldShowBackupReminder({ itemCount: 20, dismissedAt: ago(3), now })).toBe(false)
    expect(shouldShowBackupReminder({ itemCount: 20, dismissedAt: ago(8), now })).toBe(true)
    expect(shouldShowBackupReminder({ lastBackupAt: ago(60), dismissedAt: ago(1), itemCount: 20, now })).toBe(false)
  })

  it('ignores invalid timestamps', () => {
    expect(shouldShowBackupReminder({ lastBackupAt: 'garbage', itemCount: 10, now })).toBe(true)
    expect(shouldShowBackupReminder({ lastBackupAt: 'garbage', itemCount: 3, now })).toBe(false)
  })
})

describe('daysSince', () => {
  it('counts whole days and tolerates bad input', () => {
    expect(daysSince(new Date(now.getTime() - 3.9 * 86400000).toISOString(), now)).toBe(3)
    expect(daysSince(undefined, now)).toBeUndefined()
    expect(daysSince('nope', now)).toBeUndefined()
  })
})
