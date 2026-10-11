import { useLiveQuery } from 'dexie-react-hooks'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '../../components/Toast'
import { db } from '../../data/db'
import { repo } from '../../data/repo'
import { countFinishedInMonth } from '../../domain/stats'
import { latestLog, TransitionError, type StatusAction } from '../../domain/status'
import type { Item, LogEntry, Status } from '../../domain/types'
import { Link } from 'react-router-dom'
import { NotePrompt } from './NotePrompt'
import { ItemCard } from './ItemCard'

type Tab = Extract<Status, 'want' | 'finished' | 'dropped'>
const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'want', label: 'Want' },
  { value: 'finished', label: 'Finished' },
  { value: 'dropped', label: 'Dropped' },
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

  const loading = items === undefined || logs === undefined
  const inProgress = byStatus.in_progress
  const tabItems = byStatus[tab]

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="flex items-baseline justify-between px-4 pb-2 pt-6">
        <h1 className="text-2xl font-semibold">Shelf</h1>
        {!loading && (
          <p className="text-xs opacity-60">
            {finishedThisMonth} finished this month
          </p>
        )}
      </header>

      <main className="flex-1 space-y-6 px-4 pb-48">
        <section aria-labelledby="in-progress-heading">
          <h2 id="in-progress-heading" className="mb-2 text-sm font-semibold uppercase tracking-wide opacity-60">
            In progress
          </h2>
          {inProgress.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-stone-300 p-4 text-sm opacity-60 dark:border-stone-700">
              Nothing in progress. Start something from your Want list.
            </p>
          ) : (
            <ul className="space-y-3">
              {inProgress.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  log={logFor(item.id)}
                  prominent
                  onStart={() => undefined}
                  onFinish={(rating) => run(item, { type: 'finish', rating }, `Finished â€œ${item.title}â€`)}
                  onDrop={() => run(item, { type: 'drop' }, `Dropped â€œ${item.title}â€`)}
                />
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Library">
          <div role="tablist" className="mb-3 flex gap-1 rounded-xl bg-stone-200 p-1 dark:bg-stone-800">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={tab === t.value}
                onClick={() => setTab(t.value)}
                className={`min-h-10 flex-1 rounded-lg text-sm ${
                  tab === t.value ? 'bg-white font-semibold shadow-sm dark:bg-stone-950' : 'opacity-70'
                }`}
              >
                {t.label} <span className="text-xs opacity-60">{byStatus[t.value].length}</span>
              </button>
            ))}
          </div>

          {tabItems.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm opacity-50">Nothing here yet.</p>
          ) : (
            <ul className="space-y-2">
              {tabItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  log={logFor(item.id)}
                  onStart={() => run(item, { type: 'start' }, `Started â€œ${item.title}â€`)}
                  onFinish={() => undefined}
                  onDrop={() => undefined}
                />
              ))}
            </ul>
          )}
        </section>
      </main>

      <div
        ref={barRef}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-stone-50/95 px-4 pt-3 backdrop-blur dark:border-stone-800 dark:bg-stone-950/95"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
      >
        <div className="mx-auto max-w-md space-y-2">
          {notePrompt && (
            <NotePrompt
              key={notePrompt.logId}
              title={notePrompt.title}
              onSave={(notes) => repo.setLogNotes(notePrompt.logId, notes)}
              onDismiss={() => setNotePrompt(null)}
            />
          )}
          <Link
            to="/add"
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-amber-500 text-base font-semibold text-stone-950 active:opacity-70"
          >
            + Add
          </Link>
        </div>
      </div>
    </div>
  )
}
