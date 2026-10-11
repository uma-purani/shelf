import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Cover } from '../../components/Cover'
import { SaveOnBlurField } from '../../components/SaveOnBlurField'
import { StarDisplay } from '../../components/Stars'
import { useToast } from '../../components/Toast'
import { db } from '../../data/db'
import { repo } from '../../data/repo'
import { isCaughtUp } from '../../domain/progress'
import type { Item, ItemType, LogEntry, Status } from '../../domain/types'
import { useGoBack } from '../../hooks/useGoBack'

const TYPE_LABEL: Record<ItemType, string> = { book: 'Book', movie: 'Movie', show: 'Show' }
const STATUS_LABEL: Record<Status, string> = {
  want: 'Want',
  in_progress: 'In progress',
  finished: 'Finished',
  dropped: 'Dropped',
}
const PROGRESS_HINT: Record<ItemType, string> = { book: 'p. 142', show: 'S2E4', movie: '45 min' }

export default function ItemDetail() {
  const { id = '' } = useParams()
  const goBack = useGoBack()
  const navigate = useNavigate()
  const toast = useToast()

  const item = useLiveQuery(() => db.items.get(id), [id])
  const logs = useLiveQuery(
    async () => (await db.logs.where('itemId').equals(id).toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [id],
  )
  const allItems = useLiveQuery(() => db.items.toArray(), [])
  const recommenders = useMemo(
    () => [...new Set((allItems ?? []).map((i) => i.recommendedBy).filter((r): r is string => !!r))].sort(),
    [allItems],
  )

  async function saveRecommendedBy(current: Item, text: string) {
    const { recommendedBy: _old, ...rest } = current
    const trimmed = text.trim()
    await repo.replaceItem({ ...rest, ...(trimmed ? { recommendedBy: trimmed } : {}), updatedAt: new Date().toISOString() })
  }

  async function remove(current: Item) {
    const { undo } = await repo.deleteItem(current.id)
    toast.show(`Deleted “${current.title}”`, undo)
    navigate('/', { replace: true })
  }

  if (item === undefined || logs === undefined) return <Shell onBack={goBack} title="" />
  if (!item) {
    return (
      <Shell onBack={goBack} title="Not found">
        <p className="pt-10 text-center text-sm opacity-60">This item no longer exists.</p>
        <Link to="/" replace className="mt-4 block text-center text-sm font-medium text-amber-600 dark:text-amber-400">
          Back to Shelf
        </Link>
      </Shell>
    )
  }

  const meta = [TYPE_LABEL[item.type], item.creator, item.year].filter(Boolean).join(' · ')
  const latest = logs[0]

  return (
    <Shell onBack={goBack} title={item.title}>
      <div className="flex gap-4">
        <Cover title={item.title} url={item.coverUrl} className="h-40 w-28 shrink-0" />
        <div className="min-w-0 space-y-1 pt-1">
          <p className="text-xs opacity-60">{meta}</p>
          <p className="text-sm">
            {STATUS_LABEL[item.status]}
            {isCaughtUp(item, latest) && <span className="opacity-60"> · caught up</span>}
          </p>
          {item.isDraft && (
            <Link
              to={`/match/${item.id}`}
              className="mt-2 inline-flex min-h-10 items-center rounded-xl bg-amber-500 px-3 text-sm font-semibold text-stone-950 active:opacity-70"
            >
              Find details
            </Link>
          )}
        </div>
      </div>

      <section className="mt-6 space-y-3">
        <SaveOnBlurField
          label="Recommended by"
          value={item.recommendedBy}
          list="recommenders"
          placeholder="A person, podcast, article…"
          onSave={(text) => saveRecommendedBy(item, text)}
        />
        <datalist id="recommenders">
          {recommenders.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </section>

      <section className="mt-8" aria-label="Log history">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">Log</h2>
        {logs.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-300 p-4 text-sm opacity-60 dark:border-stone-700">
            Nothing logged yet. Start it from the home screen.
          </p>
        ) : (
          <ul className="space-y-3">
            {logs.map((log, i) => (
              <LogCard key={log.id} item={item} log={log} current={i === 0} number={logs.length - i} />
            ))}
          </ul>
        )}
      </section>

      <button
        type="button"
        onClick={() => remove(item)}
        className="mt-10 min-h-11 w-full rounded-xl text-sm font-medium text-red-600 ring-1 ring-red-300 active:bg-red-50 dark:text-red-400 dark:ring-red-900 dark:active:bg-red-950"
      >
        Delete
      </button>
    </Shell>
  )
}

function LogCard({ item, log, current, number }: { item: Item; log: LogEntry; current: boolean; number: number }) {
  const toast = useToast()
  const dates = [
    log.startedAt && `Started ${log.startedAt}`,
    log.finishedAt && `Finished ${log.finishedAt}`,
    log.droppedAt && `Dropped ${log.droppedAt}`,
  ].filter(Boolean)

  const save = async (patch: { progress?: string; notes?: string }) => {
    try {
      await repo.updateLog(log.id, patch)
    } catch (e) {
      toast.show(`Couldn't save: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }

  return (
    <li className="space-y-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{current ? 'Current' : `Run ${number}`}</p>
        <StarDisplay rating={log.rating} size={16} />
      </div>
      {dates.length > 0 && <p className="text-xs opacity-60">{dates.join(' · ')}</p>}
      {log.caughtUp && <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Caught up</p>}

      {item.status === 'in_progress' && current && (
        <SaveOnBlurField
          label="Progress"
          value={log.progress}
          placeholder={`e.g. ${PROGRESS_HINT[item.type]}`}
          onSave={(text) => save({ progress: text })}
        />
      )}
      {!(item.status === 'in_progress' && current) && log.progress && (
        <p className="text-xs opacity-60">Progress: {log.progress}</p>
      )}

      <SaveOnBlurField
        label="Review notes"
        value={log.notes}
        multiline
        placeholder="Your thoughts on it"
        onSave={(text) => save({ notes: text })}
      />
    </li>
  )
}

function Shell({ onBack, title, children }: { onBack: () => void; title: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-16 pt-4">
      <header className="mb-4 flex items-center gap-2">
        <button
          type="button"
          aria-label="Back"
          onClick={onBack}
          className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl active:bg-stone-200 dark:active:bg-stone-800"
        >
          ←
        </button>
        <h1 className="min-w-0 truncate text-lg font-semibold">{title}</h1>
      </header>
      {children}
    </div>
  )
}
