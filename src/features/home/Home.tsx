import { useLiveQuery } from 'dexie-react-hooks'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '../../components/Toast'
import { db } from '../../data/db'
import { repo } from '../../data/repo'
import { bumpProgress, type BumpKind } from '../../domain/bump'
import { isCaughtUp } from '../../domain/progress'
import { countFinishedInMonth } from '../../domain/stats'
import { latestLog, TransitionError, type StatusAction } from '../../domain/status'
import type { Item, LogEntry, Status } from '../../domain/types'
import { Link } from 'react-router-dom'
import { BackupBanner } from '../backup/BackupBanner'
import { LossAlert } from '../health/LossAlert'
import { NotePrompt } from './NotePrompt'
import { ItemCard } from './ItemCard'

// Dropped items live on their own screen (top-right "Dropped"), not on the main one.
type Tab = Extract<Status, 'want' | 'finished'>
const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'want', label: 'Queue' },
  { value: 'finished', label: 'Finished' },
]

const byRecent = (a: Item, b: Item) => b.updatedAt.localeCompare(a.updatedAt)

export default function Home() {
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('want')
  const [notePrompt, setNotePrompt] = useState<{ logId: string; title: string } | null>(null)

  const barRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = barRef.current
    if (!el) return
    const publish = () => document.documentElement.style.setProperty('--bar-h', `${el.offsetHeight}px`)
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => {
      ro.disconnect()
      document.documentElement.style.removeProperty('--bar-h')
    }
  }, [])

  const items = useLiveQuery(() => db.items.toArray(), [])
  const logs = useLiveQuery(() => db.logs.toArray(), [])

  const { byStatus, logFor, finishedThisMonth } = useMemo(() => {
    const grouped: Record<Status, Item[]> = { want: [], in_progress: [], finished: [], dropped: [] }
    for (const item of items ?? []) grouped[item.status].push(item)
    for (const list of Object.values(grouped)) list.sort(byRecent)

    const logsByItem = new Map<string, LogEntry[]>()
    for (const log of logs ?? []) {
      const list = logsByItem.get(log.itemId)
      if (list) list.push(log)
      else logsByItem.set(log.itemId, [log])
    }
    return {
      byStatus: grouped,
      logFor: (itemId: string) => latestLog(logsByItem.get(itemId) ?? []),
      finishedThisMonth: countFinishedInMonth(logs ?? [], new Date()),
    }
  }, [items, logs])

  async function run(item: Item, action: StatusAction, message: string) {
    try {
      const { log, undo } = await repo.changeStatus(item.id, action)
      setNotePrompt(action.type === 'finish' ? { logId: log.id, title: item.title } : null)
      toast.show(message, async () => {
        await undo()
        setNotePrompt(null)
      })
    } catch (e) {
      toast.show(e instanceof TransitionError ? e.message : `Something went wrong: ${String(e)}`)
    }
  }

  async function remove(item: Item) {
    try {
      const { undo } = await repo.deleteItem(item.id)
      setNotePrompt((p) => (p && p.title === item.title ? null : p))
      toast.show(`Deleted “${item.title}”`, undo)
    } catch (e) {
      toast.show(`Couldn't delete: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }

  async function setCaughtUp(item: Item, value: boolean) {
    const log = logFor(item.id)
    if (!log) return
    try {
      const { undo } = await repo.updateLog(log.id, { caughtUp: value })
      toast.show(value ? `Caught up on “${item.title}”` : `Watching “${item.title}” again`, undo)
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  async function saveProgress(item: Item, text: string) {
    const log = logFor(item.id)
    if (!log) return
    try {
      await repo.updateLog(log.id, { progress: text })
    } catch (e) {
      toast.show(`Couldn't save progress: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }

  async function bump(item: Item, kind: BumpKind) {
    const log = logFor(item.id)
    if (!log) return
    const next = bumpProgress(kind, log.progress)
    if (next === undefined) {
      toast.show(`Can't add to “${log.progress}”. Tap Progress to edit it instead.`)
      return
    }
    try {
      const { undo } = await repo.updateLog(log.id, { progress: next })
      toast.show(`Progress: ${next}`, undo)
    } catch (e) {
      toast.show(`Couldn't update progress: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }

  /** Everything an ItemCard can do, bound to one item. */
  const handlers = (item: Item) => ({
    onStart: () => run(item, { type: 'start' }, `Started “${item.title}”`),
    onFinish: (rating: number) => run(item, { type: 'finish', rating }, `Finished “${item.title}”`),
    onDrop: () => run(item, { type: 'drop' }, `Dropped “${item.title}”`),
    onDelete: () => remove(item),
    onCaughtUp: (value: boolean) => setCaughtUp(item, value),
    onSaveProgress: (text: string) => saveProgress(item, text),
    onBump: (kind: BumpKind) => bump(item, kind),
  })

  const loading = items === undefined || logs === undefined
  const draftCount = (items ?? []).filter((i) => i.isDraft).length
  const inProgress = byStatus.in_progress.filter((i) => !isCaughtUp(i, logFor(i.id)))
  const caughtUp = byStatus.in_progress.filter((i) => isCaughtUp(i, logFor(i.id)))
  const tabItems = byStatus[tab]

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="flex items-center justify-between px-4 pb-1 pt-5">
        <h1 className="text-2xl font-semibold">Shelf</h1>
        <nav className="-mr-2 flex items-center text-sm text-muted">
          <Link to="/quotes" className="flex min-h-11 items-center rounded-xl px-3 active:bg-chip">
            Quotes
          </Link>
          <Link to="/dropped" className="flex min-h-11 items-center rounded-xl px-3 active:bg-chip">
            Dropped
          </Link>
          <Link to="/backup" className="flex min-h-11 items-center rounded-xl px-3 active:bg-chip">
            Backup
          </Link>
        </nav>
      </header>

      <LossAlert />
      <BackupBanner />

      {!loading && (
        <div className="flex items-center justify-between gap-2 px-4 pb-2">
          {draftCount > 0 ? (
            <Link
              to="/drafts"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-chip px-3 text-xs active:bg-line"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              {draftCount} {draftCount === 1 ? 'item needs' : 'items need'} details
            </Link>
          ) : (
            <span />
          )}
          <Link to="/stats" className="-mr-2 flex min-h-11 items-center rounded-xl px-2 text-xs text-muted active:bg-chip">
            {finishedThisMonth} finished this month &rsaquo;
          </Link>
        </div>
      )}

      <main className="flex-1 space-y-6 px-4 pb-48">
        <section aria-labelledby="in-progress-heading">
          <h2 id="in-progress-heading" className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            In progress
          </h2>
          {inProgress.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">
              {caughtUp.length > 0
                ? 'Nothing to watch right now. You are caught up on everything below.'
                : 'Nothing in progress. Start something from your Queue.'}
            </p>
          ) : (
            <ul className="space-y-3">
              {inProgress.map((item) => (
                <ItemCard key={item.id} item={item} log={logFor(item.id)} prominent {...handlers(item)} />
              ))}
            </ul>
          )}

          {caughtUp.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Caught up &middot; waiting for more
              </h3>
              <ul className="space-y-2">
                {caughtUp.map((item) => (
                  <ItemCard key={item.id} item={item} log={logFor(item.id)} {...handlers(item)} />
                ))}
              </ul>
            </div>
          )}
        </section>

        <section aria-label="Library">
          <div role="tablist" className="mb-3 flex gap-1 rounded-xl bg-chip p-1">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={tab === t.value}
                onClick={() => setTab(t.value)}
                className={`min-h-10 flex-1 rounded-lg text-sm ${
                  tab === t.value ? 'bg-card font-semibold shadow-sm' : 'text-muted'
                }`}
              >
                {t.label} <span className="text-xs text-muted">{byStatus[t.value].length}</span>
              </button>
            ))}
          </div>

          {tabItems.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-muted">Nothing here yet.</p>
          ) : (
            <ul className="space-y-2">
              {tabItems.map((item) => (
                <ItemCard key={item.id} item={item} log={logFor(item.id)} {...handlers(item)} />
              ))}
            </ul>
          )}
        </section>
      </main>

      <div
        ref={barRef}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 px-4 pt-3 backdrop-blur"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
      >
        <div className="mx-auto max-w-md space-y-2">
          {notePrompt && (
            <NotePrompt
              key={notePrompt.logId}
              title={notePrompt.title}
              onSave={(notes) => void repo.updateLog(notePrompt.logId, { notes })}
              onDismiss={() => setNotePrompt(null)}
            />
          )}
          <div className="flex gap-2">
            <Link
              to="/add"
              className="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-accent text-base font-semibold text-on-accent active:opacity-70"
            >
              + Add
            </Link>
            <Link
              to="/capture"
              className="flex min-h-12 items-center justify-center rounded-xl px-4 text-sm font-medium ring-1 ring-line active:bg-line"
            >
              Quick capture
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
