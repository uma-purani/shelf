import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { useToast } from '../../components/Toast'
import { db } from '../../data/db'
import { repo } from '../../data/repo'
import { latestLog } from '../../domain/status'
import type { Item, LogEntry } from '../../domain/types'
import { useGoBack } from '../../hooks/useGoBack'
import { ItemCard } from '../home/ItemCard'

const noop = () => undefined

/** Everything you started and abandoned. Resume brings an item back to In progress. */
export default function DroppedScreen() {
  const goBack = useGoBack()
  const toast = useToast()
  const items = useLiveQuery(() => db.items.where('status').equals('dropped').toArray(), [])
  const logs = useLiveQuery(() => db.logs.toArray(), [])

  const sorted = useMemo(() => [...(items ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [items])
  const logFor = useMemo(() => {
    const byItem = new Map<string, LogEntry[]>()
    for (const l of logs ?? []) byItem.set(l.itemId, [...(byItem.get(l.itemId) ?? []), l])
    return (itemId: string) => latestLog(byItem.get(itemId) ?? [])
  }, [logs])

  async function resume(item: Item) {
    try {
      const { undo } = await repo.changeStatus(item.id, { type: 'start' })
      toast.show(`Resumed “${item.title}”`, undo)
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Something went wrong')
    }
  }
  async function remove(item: Item) {
    try {
      const { undo } = await repo.deleteItem(item.id)
      toast.show(`Deleted “${item.title}”`, undo)
    } catch (e) {
      toast.show(`Couldn't delete: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }

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
        <h1 className="text-lg font-semibold">Dropped</h1>
      </header>

      {items && sorted.length === 0 && (
        <p className="pt-10 text-center text-sm text-muted">Nothing dropped. Items you abandon will show up here.</p>
      )}

      <ul className="space-y-2">
        {sorted.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            log={logFor(item.id)}
            onStart={() => resume(item)}
            onDelete={() => remove(item)}
            onFinish={noop}
            onDrop={noop}
            onCaughtUp={noop}
            onSaveProgress={noop}
          />
        ))}
      </ul>
    </div>
  )
}
