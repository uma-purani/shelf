import { useMemo, useState } from 'react'
import { useToast } from '../../components/Toast'
import { formatRating } from '../../domain/rating'
import { statsByGenre } from '../../domain/stats'
import type { Item, ItemType, LogEntry } from '../../domain/types'
import { genreBackfill, genreTarget } from '../../services/genreBackfill'

const FILTERS: Array<{ value: ItemType | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'book', label: 'Books' },
  { value: 'movie', label: 'Movies' },
  { value: 'show', label: 'Shows' },
]
const TOP = 8

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Which genres you finish most and rate highest, plus a one-tap lookup for items saved without genres. */
export function GenreCard({ items, logs }: { items: Item[]; logs: LogEntry[] }) {
  const toast = useToast()
  const [filter, setFilter] = useState<ItemType | 'all'>('all')
  const [showAll, setShowAll] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const stats = useMemo(() => statsByGenre(items, logs, filter === 'all' ? undefined : filter), [items, logs, filter])
  const missing = useMemo(() => items.filter((i) => !i.genres?.length), [items])
  const lookupable = useMemo(() => missing.filter((i) => genreTarget(i)).length, [missing])
  const byHand = missing.length - lookupable

  const rows = showAll ? stats.genres : stats.genres.slice(0, TOP)
  const max = Math.max(1, ...stats.genres.map((g) => g.finished))

  async function lookUp() {
    setProgress({ done: 0, total: lookupable })
    try {
      const r = await genreBackfill.run((done, total) => setProgress({ done, total }))
      const parts = [`Found genres for ${plural(r.updated, 'item', 'items')}`]
      if (r.noGenres) parts.push(`${r.noGenres} had none listed`)
      if (r.failed) parts.push(r.stoppedEarly ? "stopped: couldn't reach the lookup service" : `${r.failed} failed`)
      toast.show(parts.join(', '), r.updated > 0 ? r.undo : undefined)
    } catch (e) {
      toast.show(`Couldn't look up genres: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      setProgress(null)
    }
  }

  return (
    <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line" aria-label="By genre">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">By genre</h2>

      <div role="radiogroup" aria-label="Show genres for" className="mt-3 flex gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="radio"
            aria-checked={filter === f.value}
            onClick={() => {
              setFilter(f.value)
              setShowAll(false)
            }}
            className={`min-h-9 flex-1 rounded-full text-xs ${filter === f.value ? 'bg-ink font-semibold text-bg' : 'bg-chip'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {stats.genres.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          {stats.finishedTotal === 0
            ? 'Nothing finished yet in this view.'
            : 'None of what you finished has a genre yet.'}
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {rows.map((g) => (
            <li key={g.genre}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium">{g.genre}</span>
                <span className="shrink-0 text-xs text-muted tabular-nums">
                  {g.finished} finished{g.averageRating !== undefined ? ` · avg ${formatRating(g.averageRating)}` : ''}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-chip" aria-hidden>
                <div className="h-full rounded-full bg-accent" style={{ width: `${(g.finished / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {stats.genres.length > TOP && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 min-h-11 w-full rounded-xl text-sm font-medium text-accent active:bg-chip"
        >
          {showAll ? 'Show fewer' : `Show all ${stats.genres.length}`}
        </button>
      )}

      {stats.genres.length > 0 && (
        <p className="mt-3 text-xs text-muted">
          An item counts in each of its genres, so the counts add up to more than your total.
          {stats.finishedWithoutGenre > 0 &&
            ` ${plural(stats.finishedWithoutGenre, 'finished item has', 'finished items have')} no genre.`}
        </p>
      )}

      {lookupable > 0 && (
        <div className="mt-3 rounded-xl bg-chip p-3">
          <p className="text-sm">
            {plural(lookupable, 'item has', 'items have')} no genre yet. They can be looked up from where they came from.
          </p>
          <button
            type="button"
            onClick={lookUp}
            disabled={progress !== null}
            className="mt-2 min-h-11 w-full rounded-xl bg-accent text-sm font-semibold text-on-accent active:opacity-70 disabled:opacity-60"
          >
            {progress ? `Looking up ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : 'Look up genres'}
          </button>
        </div>
      )}
      {byHand > 0 && (
        <p className="mt-3 text-xs text-muted">
          {plural(byHand, 'item was', 'items were')} added by hand, so add genres on {byHand === 1 ? 'it' : 'each'} yourself.
        </p>
      )}
    </section>
  )
}
