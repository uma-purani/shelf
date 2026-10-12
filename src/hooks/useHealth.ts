import { useSyncExternalStore } from 'react'
import type { HealthState } from '../domain/health'
import { getHealth, subscribeHealth } from '../services/healthMonitor'

/** The app's health record (launch history, storage errors, loss alert), kept up to date live. */
export function useHealth(): HealthState {
  return useSyncExternalStore(subscribeHealth, getHealth)
}
