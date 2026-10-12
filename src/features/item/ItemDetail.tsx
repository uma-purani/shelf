import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Cover } from '../../components/Cover'
import { DateField } from '../../components/DateField'
import { SaveOnBlurField } from '../../components/SaveOnBlurField'
import { StarDisplay } from '../../components/Stars'
import { useToast } from '../../components/Toast'
import { db } from '../../data/db'
import { repo } from '../../data/repo'
import { toLocalDate } from '../../domain/dates'
import { isCaughtUp, type LogPatch } from '../../domain/progress'
import type { Item, ItemType, LogEntry, Status } from '../../domain/types'
import { useGoBack } from '../../hooks/useGoBack'
import { ItemQuotes } from '../quotes/ItemQuotes'

const TYPE_LABEL: Record<ItemType, string> = { book: 'Book', movie: 'Movie', show: 'Show' }
const STATUS_LABEL: Record<Status, string> = {
  want: 'Queue',
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
        <p className="pt-10 text-center text-sm text-muted">This item no longer exists.</p>
        <Link to="/" replace className="mt-4 block text-center text-sm font-medium text-accent">
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
          <p className="text-xs text-muted">{meta}</p>
          <p className="text-sm">
            {STATUS_LABEL[item.status]}
            {isCaughtUp(item, latest) && <span className="text-muted"> · caught up</span>}
          </p>
          {item.isDraft && (
            <Link
              to={`/match/${item.id}`}
              className="mt-2 inline-flex min-h-10 items-center rounded-xl bg-accent px-3 text-sm font-semibold text-on-accent active:opacity-70"
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
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Log</h2>
        {logs.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">
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

      <ItemQuotes itemId={item.id} />

      <button
        type="button"
        onClick={() => remove(item)}
        className="mt-10 min-h-11 w-full rounded-xl text-sm font-medium text-danger ring-1 ring-danger/40 active:bg-danger/10"
      >
        Delete
      </button>
    </Shell>
  )
}

function LogCard({ item, log, current, number }: { item: Item; log: LogEntry; current: boolean; number: number }) {
  const toast = useToast()
  const [resetKey, setResetKey] = useState(0)
  const today = toLocalDate(new Date())

  const save = async (patch: LogPatch) => {
    try {
      await repo.updateLog(log.id, patch)
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Couldn't save that")
      setResetKey((k) => k + 1) // put any rejected date back to what is stored
    }
  }

  return (
    <li className="space-y-3 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-line">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{current ? 'Current' : `Run ${number}`}</p>
        <StarDisplay rating={log.rating} size={16} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <DateField
          label="Started"
          value={log.startedAt}
          max={log.finishedAt ?? log.droppedAt ?? today}
          resetKey={resetKey}
          onChange={(startedAt) => save({ startedAt })}
        />
        {log.finishedAt && (
          <DateField
            label="Finished"
            value={log.finishedAt}
            min={log.startedAt}
            max={today}
            resetKey={resetKey}
            onChange={(finishedAt) => save({ finishedAt })}
          />
        )}
        {log.droppedAt && (
          <DateField
            label="Dropped"
            value={log.droppedAt}
            min={log.startedAt}
            max={today}
            resetKey={resetKey}
            onChange={(droppedAt) => save({ droppedAt })}
          />
        )}
      </div>
      {log.caughtUp &&<p className="text-xs font-medium text-accent">Caught up</p>}

      {item.status === 'in_progress' && current && (
        <SaveOnBlurField
          label="Progress"
          value={log.progress}
          placeholder={`e.g. ${PROGRESS_HINT[item.type]}`}
          onSave={(text) => save({ progress: text })}
        />
      )}
      {!(item.status === 'in_progress' && current) && log.progress && (
        <p className="text-xs text-muted">Progress: {log.progress}</p>
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
          className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl active:bg-line"
        >
          ←
        </button>
        <h1 className="min-w-0 truncate text-lg font-semibold">{title}</h1>
      </header>
      {children}
    </div>
  )
}
