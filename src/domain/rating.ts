export const MIN_RATING = 0.5
export const MAX_RATING = 5
export const STAR_COUNT = 5

export function isValidRating(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_RATING &&
    value <= MAX_RATING &&
    Number.isInteger(value * 2)
  )
}

/**
 * Rating from a tap on a star.
 * @param star 1-based star index (1..5)
 * @param fraction horizontal tap position within the star, 0 (left edge) to 1 (right edge)
 * Left half gives a half rating (4th star, left half = 3.5), right half a full one.
 */
export function ratingFromTap(star: number, fraction: number): number {
  if (!Number.isInteger(star) || star < 1 || star > STAR_COUNT) {
    throw new RangeError(`star must be an integer 1..${STAR_COUNT}`)
  }
  return fraction < 0.5 ? star - 0.5 : star
}

export type StarFill = 'full' | 'half' | 'empty'

/** Fill state of each of the five stars for a given rating. */
export function starFills(rating: number | undefined): StarFill[] {
  const r = rating ?? 0
  return Array.from({ length: STAR_COUNT }, (_, i) => {
    if (r >= i + 1) return 'full'
    if (r >= i + 0.5) return 'half'
    return 'empty'
  })
}

/** "4" or "3.5". */
export function formatRating(rating: number): string {
  return Number.isInteger(rating) ? String(rating) : rating.toFixed(1)
}

/** Average of defined ratings, rounded to 2 decimals; undefined when there are none. */
export function averageRating(ratings: Array<number | undefined>): number | undefined {
  const valid = ratings.filter((r): r is number => r !== undefined)
  if (valid.length === 0) return undefined
  const sum = valid.reduce((a, b) => a + b, 0)
  return Math.round((sum / valid.length) * 100) / 100
}
