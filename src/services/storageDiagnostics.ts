import { buildBackup, type Snapshot } from '../domain/backup'
import { db as appDb } from '../data/db'

/**
 * Storage check. Everything here deliberately avoids the app's own database layer where it can,
 * so it still works when that layer is what's broken: it reads IndexedDB directly and never
 * creates a database as a side effect of looking.
 */

export const DB_NAME = 'shelf'

export interface RawStoreInfo {
  name: string
  count: number
}

export type RawShelf =
  | { status: 'missing' }
  | { status: 'unknown'; reason: string }
  | { status: 'error'; error: string }
  | { status: 'opened'; version: number; stores: RawStoreInfo[] }

export interface DiagnosticsReport {
  origin: string
  secure: boolean
  /** Running as the installed app (home-screen icon) rather than in a browser tab. */
  standalone: boolean
  /** Whether the browser promised not to evict this site's data. null = can't tell. */
  persisted: boolean | null
  estimate: { usage?: number; quota?: number; indexedDB?: number; caches?: number } | null
  databases: Array<{ name: string; version?: number }> | 'unsupported'
  shelf: RawShelf
  /** Result of opening the database the normal (app) way. */
  app: { ok: true; items: number; logs: number; quotes: number } | { ok: false; error: string }
  serviceWorker: { registered: boolean; controlling: boolean; state?: string }
  caches: Array<{ name: string; entries: number }>
  lastBackupAt?: string
}

export function formatBytes(n: number | undefined): string {
  if (n === undefined) return 'unknown'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

const request = <T,>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

async function listDatabases(factory: IDBFactory): Promise<DiagnosticsReport['databases']> {
  if (typeof factory.databases !== 'function') return 'unsupported'
  try {
    return (await factory.databases()).flatMap((d) => (d.name ? [{ name: d.name, version: d.version }] : []))
  } catch {
    return 'unsupported'
  }
}

/** Open an existing database without creating it: if it turns out not to exist, the open is aborted. */
function openExisting(factory: IDBFactory, name: string): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    const req = factory.open(name)
    req.onupgradeneeded = () => {
      // Only fires for a database that did not exist. Abort so merely looking never creates one.
      req.transaction?.abort()
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      if (req.error?.name === 'AbortError') resolve(null)
      else reject(req.error)
    }
  })
}

export async function inspectRawShelf(factory: IDBFactory = indexedDB, name = DB_NAME): Promise<RawShelf> {
  const dbs = await listDatabases(factory)
  if (dbs !== 'unsupported' && !dbs.some((d) => d.name === name)) return { status: 'missing' }
  try {
    const db = await openExisting(factory, name)
    if (!db) return { status: 'missing' }
    try {
      const stores = await Promise.all(
        [...db.objectStoreNames].map(async (store) => ({
          name: store,
          count: await request(db.transaction(store).objectStore(store).count()),
        })),
      )
      return { status: 'opened', version: db.version, stores }
    } finally {
      db.close()
    }
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : String(e) }
  }
}

/** Read every row of the four data stores straight from IndexedDB (bypassing the app's database layer). */
export async function readRawSnapshot(factory: IDBFactory = indexedDB, name = DB_NAME): Promise<Snapshot> {
  const db = await openExisting(factory, name)
  if (!db) throw new Error('There is no Shelf database at this address.')
  try {
    const all = async (store: string) =>
      db.objectStoreNames.contains(store) ? request(db.transaction(store).objectStore(store).getAll()) : []
    const [items, logs, quotes, pendingLookups] = await Promise.all([all('items'), all('logs'), all('quotes'), all('pendingLookups')])
    return { items, logs, quotes, pendingLookups } as Snapshot
  } finally {
    db.close()
  }
}

/** A backup file made straight from the raw database: a rescue copy that doesn't depend on the app working. */
export async function rescueBackup(now: Date = new Date()): Promise<{ text: string; fileName: string; itemCount: number }> {
  const snapshot = await readRawSnapshot()
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return {
    text: JSON.stringify(buildBackup(snapshot, now), null, 2),
    fileName: `shelf-rescue-${stamp}.json`,
    itemCount: snapshot.items.length,
  }
}

export async function collectDiagnostics(): Promise<DiagnosticsReport> {
  const storage = navigator.storage
  const estimateRaw = (await storage?.estimate?.().catch(() => undefined)) as
    | (StorageEstimate & { usageDetails?: { indexedDB?: number; caches?: number } })
    | undefined

  const [persisted, databases, shelf, app, serviceWorker, cacheNames] = await Promise.all([
    storage?.persisted?.().catch(() => null) ?? Promise.resolve(null),
    listDatabases(indexedDB),
    inspectRawShelf(),
    (async (): Promise<DiagnosticsReport['app']> => {
      try {
        await appDb.open()
        const [items, logs, quotes] = await Promise.all([appDb.items.count(), appDb.logs.count(), appDb.quotes.count()])
        return { ok: true, items, logs, quotes }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    })(),
    (async () => {
      const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined)
      return { registered: !!reg, controlling: !!navigator.serviceWorker?.controller, state: reg?.active?.state }
    })(),
    typeof caches === 'undefined' ? Promise.resolve([] as string[]) : caches.keys().catch(() => [] as string[]),
  ])

  const cacheInfo = await Promise.all(
    cacheNames.map(async (name) => ({ name, entries: (await (await caches.open(name)).keys()).length })),
  )
  const lastBackup = await appDb.settings.get('lastBackupAt').catch(() => undefined)

  return {
    origin: location.origin,
    secure: window.isSecureContext,
    standalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
    persisted,
    estimate: estimateRaw
      ? {
          usage: estimateRaw.usage,
          quota: estimateRaw.quota,
          indexedDB: estimateRaw.usageDetails?.indexedDB,
          caches: estimateRaw.usageDetails?.caches,
        }
      : null,
    databases,
    shelf,
    app,
    serviceWorker,
    caches: cacheInfo,
    lastBackupAt: lastBackup?.value as string | undefined,
  }
}

// ---------------------------------------------------------------------------------------------
// Plain-language verdict
// ---------------------------------------------------------------------------------------------

export interface Verdict {
  tone: 'good' | 'warn' | 'bad'
  headline: string
  details: string[]
}

const rows = (shelf: RawShelf, store: string) =>
  shelf.status === 'opened' ? (shelf.stores.find((s) => s.name === store)?.count ?? 0) : 0

/** What the numbers mean, in words. */
export function diagnose(r: DiagnosticsReport): Verdict {
  const details: string[] = []
  const rawItems = rows(r.shelf, 'items')

  if (r.persisted === false) {
    details.push(
      "The browser has not promised to keep this site's data. If the phone runs low on space it may clear it. Back up regularly.",
    )
  }
  if (!r.secure) details.push('This address is not secure (not https), so the browser treats the data as less permanent.')
  const cachedFiles = r.caches.reduce((n, c) => n + c.entries, 0)
  const emptyOrMissing = r.shelf.status === 'missing' || (r.shelf.status === 'opened' && rawItems === 0)
  if (cachedFiles > 0 && emptyOrMissing) {
    details.push(
      `Stored files for the app itself are still here (${r.caches.map((c) => `${c.name}: ${c.entries}`).join(', ')}), so the site was probably not cleared as a whole. Only the database is empty or gone.`,
    )
  }

  if (r.app.ok && r.app.items > 0) {
    return { tone: 'good', headline: `Your data is here: ${r.app.items} items, ${r.app.logs} log entries, ${r.app.quotes} quotes.`, details }
  }
  if (r.shelf.status === 'opened' && rawItems > 0 && !r.app.ok) {
    return {
      tone: 'bad',
      headline: `Your data is still stored (${rawItems} items) but the app can't open it.`,
      details: [`Error from the app: ${r.app.error}`, 'Tap "Save a rescue copy" now, before doing anything else.', ...details],
    }
  }
  if (r.shelf.status === 'opened' && rawItems > 0) {
    return { tone: 'warn', headline: `The database holds ${rawItems} items, but the app reports none.`, details: ['Tap "Save a rescue copy", then tell the developer.', ...details] }
  }
  if (r.shelf.status === 'opened') {
    return {
      tone: 'bad',
      headline: 'The Shelf database at this address is empty.',
      details: [
        'Shelf creates an empty database the first time it opens at an address that has none. So an empty database usually means one of two things: the browser removed the old one, or your data was saved under a different address (check you are on the same address as when you last used Shelf).',
        ...details,
      ],
    }
  }
  if (r.shelf.status === 'missing') {
    return {
      tone: 'bad',
      headline: 'There is no Shelf database at this address.',
      details: [
        r.databases !== 'unsupported' && r.databases.length > 0
          ? `Databases that do exist here: ${r.databases.map((d) => d.name).join(', ')}.`
          : 'No databases exist at this address at all.',
        'Either the browser removed it, or your data was saved under a different address. Check that you are on the same address as when you last used Shelf.',
        ...details,
      ],
    }
  }
  if (r.shelf.status === 'error') {
    return { tone: 'bad', headline: "The browser couldn't open the Shelf database.", details: [`Error: ${r.shelf.error}`, ...details] }
  }
  return { tone: 'warn', headline: "Couldn't tell what is stored here.", details: [r.shelf.status === 'unknown' ? r.shelf.reason : '', ...details].filter(Boolean) }
}
