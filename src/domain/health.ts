/**
 * A small health record kept outside the database (in localStorage), so it can describe a
 * database that has vanished. It remembers how many items the library had each time it was
 * used, so an unexpectedly empty library is noticed the moment the app opens, and it keeps a
 * short history of launches and storage errors to explain what happened afterwards.
 */

export const HEALTH_KEY = 'shelf.health.v1'
const MAX_LAUNCHES = 30
const MAX_EVENTS = 30

export interface LaunchRecord {
  at: string
  items: number
  logs: number
  quotes: number
  /** Whether the browser had promised to keep this site's data. null = can't tell. */
  persisted: boolean | null
  /** Running as the installed app rather than in a browser tab. */
  standalone: boolean
  swControlling: boolean
  usage?: number
  indexedDBUsage?: number
  cachesUsage?: number
}

export interface HealthEvent {
  at: string
  kind: string
  message: string
}

export interface LossAlert {
  /** When the empty library was noticed. */
  detectedAt: string
  /** How many items it had the last time it was seen healthy, and when. */
  previousItems: number
  previousAt: string
}

export interface HealthState {
  /** The item count the last time the library was seen. */
  lastKnown?: { items: number; at: string }
  launches: LaunchRecord[]
  events: HealthEvent[]
  loss?: LossAlert
}

export const emptyHealth = (): HealthState => ({ launches: [], events: [] })

/** Read saved state, tolerating anything: missing, corrupt or from an unexpected shape. */
export function parseHealth(text: string | null | undefined): HealthState {
  if (!text) return emptyHealth()
  try {
    const raw = JSON.parse(text) as Partial<HealthState> | null
    if (!raw || typeof raw !== 'object') return emptyHealth()
    return {
      lastKnown:
        raw.lastKnown && typeof raw.lastKnown.items === 'number' && typeof raw.lastKnown.at === 'string'
          ? { items: raw.lastKnown.items, at: raw.lastKnown.at }
          : undefined,
      launches: Array.isArray(raw.launches) ? raw.launches.slice(-MAX_LAUNCHES) : [],
      events: Array.isArray(raw.events) ? raw.events.slice(-MAX_EVENTS) : [],
      loss: raw.loss && typeof raw.loss.previousItems === 'number' ? raw.loss : undefined,
    }
  } catch {
    return emptyHealth()
  }
}

/**
 * Record an app launch. If the library had items when last seen and has none now, raise a loss
 * alert (unless one is already showing). Deliberately deleting everything does not trigger it,
 * because the remembered count follows every change (see noteItemCount).
 */
export function recordLaunch(state: HealthState, launch: LaunchRecord): HealthState {
  const previous = state.lastKnown
  const lost = previous !== undefined && previous.items > 0 && launch.items === 0
  return {
    ...state,
    launches: [...state.launches, launch].slice(-MAX_LAUNCHES),
    lastKnown: { items: launch.items, at: launch.at },
    loss:
      lost && !state.loss
        ? { detectedAt: launch.at, previousItems: previous.items, previousAt: previous.at }
        : state.loss,
  }
}

/** Remember the current item count (called on every change, so a deliberate "delete all" is remembered as 0). */
export function noteItemCount(state: HealthState, items: number, at: string): HealthState {
  if (state.lastKnown?.items === items) return state
  return { ...state, lastKnown: { items, at } }
}

export function addEvent(state: HealthState, event: HealthEvent): HealthState {
  return { ...state, events: [...state.events, event].slice(-MAX_EVENTS) }
}

export function dismissLoss(state: HealthState): HealthState {
  return { ...state, loss: undefined }
}

/** Show the alert only while the library is still empty; once it has items again the user has acted. */
export function shouldShowLoss(state: HealthState, currentItems: number | undefined): boolean {
  return !!state.loss && currentItems === 0
}
