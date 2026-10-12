import { liveQuery } from 'dexie'
import { db } from '../data/db'
import {
  addEvent,
  dismissLoss,
  HEALTH_KEY,
  noteItemCount,
  parseHealth,
  recordLaunch,
  type HealthState,
} from '../domain/health'

const CHANGED = 'shelf:health-changed'

function readSaved(): string | null {
  try {
    return localStorage.getItem(HEALTH_KEY)
  } catch {
    return null // storage unavailable (private mode): the monitor just keeps state in memory
  }
}

let state: HealthState = parseHealth(readSaved())

function save(next: HealthState) {
  state = next
  try {
    localStorage.setItem(HEALTH_KEY, JSON.stringify(next))
  } catch {
    /* in-memory only */
  }
  window.dispatchEvent(new Event(CHANGED))
}

export const getHealth = (): HealthState => state

export function subscribeHealth(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange)
  return () => window.removeEventListener(CHANGED, onChange)
}

export function dismissLossAlert() {
  save(dismissLoss(state))
}

function logEvent(kind: string, message: unknown) {
  const text = message instanceof Error ? message.message : String(message)
  save(addEvent(state, { at: new Date().toISOString(), kind, message: text.slice(0, 200) }))
}

/**
 * Start watching the app's own storage. Call once at startup, before the app renders:
 * - notes how many items the library has at every launch, so an unexpectedly empty library
 *   raises an alert right away (see domain/health.ts),
 * - remembers the count after every change,
 * - records storage errors and unexpected database closes, to explain a loss afterwards.
 */
export async function startHealthMonitor(): Promise<void> {
  window.addEventListener('error', (e) => logEvent('error', e.message))
  window.addEventListener('unhandledrejection', (e) => logEvent('rejection', e.reason))
  db.on('close', () => logEvent('db-closed', 'The database connection closed'))

  try {
    const [items, logs, quotes] = await Promise.all([db.items.count(), db.logs.count(), db.quotes.count()])
    const storage = navigator.storage
    const estimate = (await storage?.estimate?.().catch(() => undefined)) as
      | (StorageEstimate & { usageDetails?: { indexedDB?: number; caches?: number } })
      | undefined
    save(
      recordLaunch(state, {
        at: new Date().toISOString(),
        items,
        logs,
        quotes,
        persisted: (await storage?.persisted?.().catch(() => null)) ?? null,
        standalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
        swControlling: !!navigator.serviceWorker?.controller,
        usage: estimate?.usage,
        indexedDBUsage: estimate?.usageDetails?.indexedDB,
        cachesUsage: estimate?.usageDetails?.caches,
      }),
    )
  } catch (e) {
    logEvent('db-open-failed', e)
  }

  // From here on, keep the remembered count in step with every change.
  liveQuery(() => db.items.count()).subscribe({
    next: (n) => save(noteItemCount(state, n, new Date().toISOString())),
    error: (e) => logEvent('db-query-failed', e),
  })
}
