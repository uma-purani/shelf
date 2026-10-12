import { describe, expect, it } from 'vitest'
import {
  addEvent,
  dismissLoss,
  emptyHealth,
  noteItemCount,
  parseHealth,
  recordLaunch,
  shouldShowLoss,
  type LaunchRecord,
} from './health'

const launch = (items: number, at = '2026-10-12T08:00:00.000Z', extra: Partial<LaunchRecord> = {}): LaunchRecord => ({
  at,
  items,
  logs: items * 2,
  quotes: 0,
  persisted: true,
  standalone: true,
  swControlling: true,
  ...extra,
})

describe('recordLaunch', () => {
  it('does not alarm on a first ever launch or a library that simply has items', () => {
    const first = recordLaunch(emptyHealth(), launch(0))
    expect(first.loss).toBeUndefined()
    const normal = recordLaunch(noteItemCount(first, 12, '2026-10-12T09:00:00.000Z'), launch(12, '2026-10-13T08:00:00.000Z'))
    expect(normal.loss).toBeUndefined()
  })

  it('raises a loss alert when a library that had items opens empty', () => {
    let s = recordLaunch(emptyHealth(), launch(40, '2026-10-11T08:00:00.000Z'))
    s = recordLaunch(s, launch(0, '2026-10-12T08:00:00.000Z'))
    expect(s.loss).toEqual({
      detectedAt: '2026-10-12T08:00:00.000Z',
      previousItems: 40,
      previousAt: '2026-10-11T08:00:00.000Z',
    })
  })

  it('does not alarm when the user deliberately deleted everything (the count follows every change)', () => {
    let s = recordLaunch(emptyHealth(), launch(3))
    s = noteItemCount(s, 2, '2026-10-12T09:00:00.000Z')
    s = noteItemCount(s, 0, '2026-10-12T09:01:00.000Z') // deleted the last item
    s = recordLaunch(s, launch(0, '2026-10-13T08:00:00.000Z'))
    expect(s.loss).toBeUndefined()
  })

  it('keeps the original alert instead of replacing it on later empty launches', () => {
    let s = recordLaunch(emptyHealth(), launch(40, '2026-10-11T08:00:00.000Z'))
    s = recordLaunch(s, launch(0, '2026-10-12T08:00:00.000Z'))
    const alert = s.loss
    s = recordLaunch(s, launch(0, '2026-10-12T10:00:00.000Z'))
    expect(s.loss).toEqual(alert)
  })

  it('keeps only the most recent launches', () => {
    let s = emptyHealth()
    for (let i = 0; i < 40; i++) s = recordLaunch(s, launch(1, `2026-10-12T08:${String(i).padStart(2, '0')}:00.000Z`))
    expect(s.launches).toHaveLength(30)
    expect(s.launches.at(-1)?.at).toBe('2026-10-12T08:39:00.000Z')
  })
})

describe('noteItemCount / events / dismiss', () => {
  it('only changes state when the count changes', () => {
    const s = noteItemCount(emptyHealth(), 5, '2026-10-12T08:00:00.000Z')
    expect(noteItemCount(s, 5, '2026-10-12T09:00:00.000Z')).toBe(s)
    expect(noteItemCount(s, 6, '2026-10-12T09:00:00.000Z').lastKnown).toEqual({ items: 6, at: '2026-10-12T09:00:00.000Z' })
  })

  it('caps events and dismisses a loss alert', () => {
    let s = emptyHealth()
    for (let i = 0; i < 50; i++) s = addEvent(s, { at: String(i), kind: 'error', message: `e${i}` })
    expect(s.events).toHaveLength(30)
    expect(s.events.at(-1)?.message).toBe('e49')
    const withLoss = recordLaunch(recordLaunch(emptyHealth(), launch(5)), launch(0))
    expect(withLoss.loss).toBeDefined()
    expect(dismissLoss(withLoss).loss).toBeUndefined()
  })
})

describe('shouldShowLoss', () => {
  it('shows only while the library is still empty', () => {
    const s = recordLaunch(recordLaunch(emptyHealth(), launch(5)), launch(0))
    expect(shouldShowLoss(s, 0)).toBe(true)
    expect(shouldShowLoss(s, 3)).toBe(false) // restored from a backup
    expect(shouldShowLoss(s, undefined)).toBe(false) // still loading
    expect(shouldShowLoss(emptyHealth(), 0)).toBe(false)
  })
})

describe('parseHealth', () => {
  it('round-trips and survives garbage', () => {
    const s = recordLaunch(emptyHealth(), launch(7))
    expect(parseHealth(JSON.stringify(s))).toEqual(s)
    for (const bad of [null, undefined, '', 'nope', '[]', '123', '{"launches":"x","events":5,"lastKnown":{"items":"a"}}']) {
      const p = parseHealth(bad as string | null)
      expect(Array.isArray(p.launches)).toBe(true)
      expect(Array.isArray(p.events)).toBe(true)
    }
  })
})
