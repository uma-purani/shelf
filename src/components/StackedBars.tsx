import type { HistoryBucket } from '../domain/stats'

const SERIES = [
  { key: 'book', label: 'Books', bar: 'bg-type-book' },
  { key: 'movie', label: 'Movies', bar: 'bg-type-movie' },
  { key: 'show', label: 'Shows', bar: 'bg-type-show' },
] as const

const PLOT_HEIGHT = 96 // px

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Spoken/hover description of one bar: "Oct 2026: 2 books, 1 show". */
function describe(b: HistoryBucket, period: string): string {
  const parts = [
    b.book && plural(b.book, 'book', 'books'),
    b.movie && plural(b.movie, 'movie', 'movies'),
    b.show && plural(b.show, 'show', 'shows'),
  ].filter(Boolean)
  return `${period}: ${parts.length ? parts.join(', ') : 'nothing finished'}`
}

/**
 * Bars of finished items per period, stacked by type. Each bar is a list item with a full
 * text description, shows its total above it, and the legend names the colors.
 */
export function StackedBars({ buckets, ariaLabel }: { buckets: HistoryBucket[]; ariaLabel: string }) {
  const max = Math.max(1, ...buckets.map((b) => b.total))
  const monthly = buckets.length > 0 && buckets[0].key.includes('-')

  return (
    <div>
      <ul aria-label={ariaLabel} className="flex items-end gap-1" style={{ height: PLOT_HEIGHT + 34 }}>
        {buckets.map((b, i) => {
          const showYear = monthly && (i === 0 || b.label === 'Jan')
          const period = monthly ? `${b.label} ${b.year}` : b.label
          return (
            <li
              key={b.key}
              aria-label={describe(b, period)}
              title={describe(b, period)}
              className="flex min-w-0 flex-1 flex-col items-center justify-end"
            >
              <span className="h-4 text-[10px] leading-4 tabular-nums text-muted">{b.total > 0 ? b.total : ''}</span>
              <div className="flex w-full max-w-7 flex-col-reverse justify-start overflow-hidden rounded-t-sm" style={{ height: PLOT_HEIGHT }}>
                {b.total === 0 ? (
                  <div className="mt-auto h-0.5 w-full bg-line" />
                ) : (
                  <div className="mt-auto flex w-full flex-col-reverse" style={{ height: `${(b.total / max) * 100}%` }}>
                    {SERIES.map((s) =>
                      b[s.key] > 0 ? (
                        <div key={s.key} className={s.bar} style={{ height: `${(b[s.key] / b.total) * 100}%`, minHeight: 3 }} />
                      ) : null,
                    )}
                  </div>
                )}
              </div>
              <span className="mt-1 h-3 text-[10px] leading-3 text-muted">{b.label}</span>
              <span className="h-3 text-[9px] leading-3 text-muted">{showYear ? b.year : ''}</span>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted" aria-hidden>
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${s.bar}`} />
            {s.label}
          </span>
        ))}
      </p>
    </div>
  )
}
