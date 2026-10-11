import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { StarDisplay } from '../../components/Stars'
import { db } from '../../data/db'
import { computeStats, type TypeCounts } from '../../domain/stats'
import { formatRating } from '../../domain/rating'
import { useGoBack } from '../../hooks/useGoBack'

const TYPE_ROWS = [
  { key: 'book', label: 'Books' },
  { key: 'movie', label: 'Movies' },
  { key: 'show', label: 'Shows' },
] as const

export default function StatsScreen() {
  const goBack = useGoBack()
  const items = useLiveQuery(() => db.items.toArray(), [])
  const logs = useLiveQuery(() => db.logs.toArray(), [])

  const stats = useMemo(
    () => (items && logs ? computeStats(items, logs, new Date()) : undefined),
    [items, logs],
  )
  const year = new Date().getFullYear()
  const monthName = new Date().toLocaleString(undefined, { month: 'long' })

  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-16 pt-4">
      <header className="mb-4 flex items-center gap-2">
        <button
          type="button"
          aria-label="Back"
          onClick={goBack}
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-2xl active:bg-line"
        >
          ←
        </button>
        <h1 className="text-lg font-semibold">Stats</h1>
      </header>

      {stats && (
        <div className="space-y-4">
          <p className="px-1 text-xs text-muted">Finished runs. A re-read or rewatch counts each time.</p>

          <CountCard title={monthName} counts={stats.thisMonth} />
          <CountCard title={String(year)} counts={stats.thisYear} />
          <CountCard title="All time" counts={stats.allTime} />

          <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line" aria-label="Average rating">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Average rating</h2>
            {stats.averageRating === undefined ? (
              <p className="mt-2 text-sm text-muted">No ratings yet.</p>
            ) : (
              <>
                <div className="mt-2 flex items-center gap-3">
                  <span className="text-4xl font-semibold tabular-nums">{formatRating(stats.averageRating)}</span>
                  <StarDisplay rating={Math.round(stats.averageRating * 2) / 2} size={18} />
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {TYPE_ROWS.map(({ key, label }) => (
                    <div key={key}>
                      <dd className="text-lg font-medium tabular-nums">
                        {stats.averageRatingByType[key] === undefined ? '–' : formatRating(stats.averageRatingByType[key])}
                      </dd>
                      <dt className="text-xs text-muted">{label}</dt>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </section>

          <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line" aria-label="Library">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Library</h2>
            <p className="mt-2 text-sm">
              <span className="text-2xl font-semibold tabular-nums">{stats.library.total}</span>{' '}
              <span className="text-muted">{stats.library.total === 1 ? 'item' : 'items'}</span>
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <LibraryRow label="Want" value={stats.library.want} />
              <LibraryRow label="In progress" value={stats.library.in_progress} />
              <LibraryRow label="Finished" value={stats.library.finished} />
              <LibraryRow label="Dropped" value={stats.library.dropped} />
            </dl>
          </section>
        </div>
      )}
    </div>
  )
}

function CountCard({ title, counts }: { title: string; counts: TypeCounts }) {
  return (
    <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line" aria-label={title}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
      <p className="mt-1">
        <span className="text-4xl font-semibold tabular-nums">{counts.total}</span>{' '}
        <span className="text-sm text-muted">finished</span>
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {TYPE_ROWS.map(({ key, label }) => (
          <div key={key} className="rounded-xl bg-chip py-2">
            <dd className="text-lg font-medium tabular-nums">{counts[key]}</dd>
            <dt className="text-xs text-muted">{label}</dt>
          </div>
        ))}
      </dl>
    </section>
  )
}

function LibraryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}
