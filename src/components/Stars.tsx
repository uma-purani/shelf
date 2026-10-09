import { formatRating, ratingFromTap, starFills, STAR_COUNT, type StarFill } from '../domain/rating'

const STAR_PATH = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'

function Star({ fill, size }: { fill: StarFill; size: number }) {
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 24 24" width={size} height={size} className="absolute inset-0 text-stone-300 dark:text-stone-600">
        <path d={STAR_PATH} fill="currentColor" />
      </svg>
      {fill !== 'empty' && (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className="absolute inset-0 text-amber-400"
          style={fill === 'half' ? { clipPath: 'inset(0 50% 0 0)' } : undefined}
        >
          <path d={STAR_PATH} fill="currentColor" />
        </svg>
      )}
    </span>
  )
}

/** Read-only rating, e.g. on cards and in log history. */
export function StarDisplay({ rating, size = 14 }: { rating: number | undefined; size?: number }) {
  if (rating === undefined) return null
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={`${formatRating(rating)} out of 5`}>
      <span className="inline-flex">
        {starFills(rating).map((fill, i) => (
          <Star key={i} fill={fill} size={size} />
        ))}
      </span>
      <span className="text-xs tabular-nums opacity-70">{formatRating(rating)}</span>
    </span>
  )
}

/**
 * Five tappable stars spanning the full row. Each star's hit area is the whole
 * (wide) button, split at its midpoint: left half = x.5, right half = x.
 * Tapping saves immediately; there is no separate confirm.
 */
export function StarRow({ onPick }: { onPick: (rating: number) => void }) {
  return (
    <div role="group" aria-label="Rate this item" className="flex w-full touch-manipulation select-none">
      {Array.from({ length: STAR_COUNT }, (_, i) => i + 1).map((star) => (
        <button
          key={star}
          type="button"
          aria-label={`${star - 0.5} or ${star} stars: tap left half for ${star - 0.5}, right half for ${star}`}
          className="flex h-14 flex-1 items-center justify-center active:opacity-60"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            // Keyboard activation reports no pointer position (detail 0): treat as a full star.
            const fraction = e.detail === 0 ? 1 : (e.clientX - rect.left) / rect.width
            onPick(ratingFromTap(star, fraction))
          }}
        >
          <Star fill="empty" size={36} />
        </button>
      ))}
    </div>
  )
}
