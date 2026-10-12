import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { StarDisplay } from '../../components/Stars'
import { db } from '../../data/db'
import { StackedBars } from '../../components/StackedBars'
import { computeStats, monthlyHistory, statsBySource, yearlyHistory, type SourceStats, type TypeCounts } from '../../domain/stats'
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

  const data = useMemo(() => {
    if (!items || !logs) return undefined
    const now = new Date()
    return {
      stats: computeStats(items, logs, now),
      monthly: monthlyHistory(items, logs, now),
      yearly: yearlyHistory(items, logs, now),
      bySource: statsBySource(items, logs),
    }
  }, [items, logs])
  const stats = data?.stats
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

      {data && stats && (
        <div className="space-y-4">
          <p className="px-1 text-xs text-muted">Finished runs. A re-read or rewatch counts each time.</p>

          <CountCard title={monthName} counts={stats.thisMonth} />
          <CountCard title={String(year)} counts={stats.thisYear} />
          <CountCard title="All time" counts={stats.allTime} />

          <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line" aria-label="Last 12 months">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Last 12 months</h2>
            <StackedBars buckets={data.monthly} ariaLabel="Finished per month, last 12 months" />
          </section>

          {data.yearly.length > 0 && (
            <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line" aria-label="By year">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">By year</h2>
              <StackedBars buckets={data.yearly} ariaLabel="Finished per year" />
            </section>
          )}

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

          <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line" aria-label="By recommendation">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">By recommendation</h2>
            {data.bySource.sources.length === 0 ? (
              <p className="mt-2 text-sm text-muted">
                Set &ldquo;Recommended by&rdquo; on an item to see whose picks you finish and rate highly.
              </p>
            ) : (
              <>
                <ul className="mt-3 divide-y divide-line">
                  {data.bySource.sources.map((s) => (
                    <SourceRow key={s.name} source={s} />
                  ))}
                </ul>
                {data.bySource.unattributed > 0 && (
                  <p className="mt-3 text-xs text-muted">
                    {data.bySource.unattributed} {data.bySource.unattributed === 1 ? 'item has' : 'items have'} no recommender.
                  </p>
                )}
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
              <LibraryRow label="Queue" value={stats.library.want} />
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

function SourceRow({ source: s }: { source: SourceStats }) {
  const rate = s.recommended > 0 ? Math.round((s.finished / s.recommended) * 100) : 0
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{s.name}</p>
        <p className="text-xs text-muted">
          {s.recommended} recommended · {s.finished} finished ({rate}%)
          {s.dropped > 0 ? ` · ${s.dropped} dropped` : ''}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {s.averageRating === undefined ? (
          <span className="text-xs text-muted">no ratings</span>
        ) : (
          <>
            <p className="text-lg font-semibold leading-none tabular-nums">{formatRating(s.averageRating)}</p>
            <p className="mt-0.5 text-[10px] text-muted">avg rating</p>
          </>
        )}
      </div>
    </li>
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
