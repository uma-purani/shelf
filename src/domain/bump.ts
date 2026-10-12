import type { ItemType } from './types'

export type BumpKind = 'episode' | 'season' | 'pages'

/** Pages added by one tap of "+10 pp". */
export const PAGE_STEP = 10

export interface BumpOption {
  kind: BumpKind
  label: string
}

/** Which one-tap increments make sense for a type of item. */
export function bumpOptions(type: ItemType): BumpOption[] {
  if (type === 'show') {
    return [
      { kind: 'episode', label: '+1 ep' },
      { kind: 'season', label: 'Next season' },
    ]
  }
  if (type === 'book') return [{ kind: 'pages', label: `+${PAGE_STEP} pp` }]
  return []
}

/** "04" stays two digits when bumped; "4" stays unpadded. */
const pad = (n: number, original: string) => (original.length > 1 && original.startsWith('0') ? String(n).padStart(original.length, '0') : String(n))

/**
 * Next value of a progress string, or undefined when the current text isn't something that can
 * be incremented (free text like "halfway through"): the caller should leave it for the user to edit.
 *
 * - episode: S2E4 -> S2E5 (also "s2 e4", "S02E04" -> "S02E05")
 * - season:  S2E4 -> S3E1
 * - pages:   p. 142 -> p. 152 (also "142", "page 142")
 * - nothing recorded yet starts at S1E1 / p. 10.
 */
export function bumpProgress(kind: BumpKind, current: string | undefined): string | undefined {
  const text = current?.trim() ?? ''

  if (kind === 'pages') {
    if (!text) return `p. ${PAGE_STEP}`
    const m = text.match(/^(?:p(?:ages?)?\.?\s*)?(\d+)$/i)
    return m ? `p. ${Number(m[1]) + PAGE_STEP}` : undefined
  }

  if (!text) return 'S1E1'
  const m = text.match(/^S\s*(\d+)\s*[-.\s]?\s*E\s*(\d+)$/i)
  if (!m) return undefined
  const [, season, episode] = m
  return kind === 'episode'
    ? `S${season}E${pad(Number(episode) + 1, episode)}`
    : `S${pad(Number(season) + 1, season)}E${episode.length > 1 && episode.startsWith('0') ? '1'.padStart(episode.length, '0') : '1'}`
}
