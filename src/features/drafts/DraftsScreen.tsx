import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { Cover } from '../../components/Cover'
import { useToast } from '../../components/Toast'
import { db } from '../../data/db'
import { repo } from '../../data/repo'
import { confirmDraft } from '../../domain/drafts'
import type { Item } from '../../domain/types'
import { useGoBack } from '../../hooks/useGoBack'

const TYPE_LABEL = { book: 'Book', movie: 'Movie', show: 'Show' } as const

/** "Needs details": drafts waiting to be matched to metadata or confirmed as they are. */
export default function DraftsScreen() {
  const goBack = useGoBack()
  const toast = useToast()
  // IndexedDB can't index booleans, so filter in memory (a personal library is small).
  const drafts = useLiveQuery(
    async () => (await db.items.filter((i) => i.isDraft).toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [],
  )

  async function keep(item: Item) {
    try {
      const { undo } = await repo.replaceItem(confirmDraft(item, new Date()))
      toast.show(`Kept “${item.title}” as is`, undo)
    } catch (e) {
      toast.show(`Couldn't update: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-4">
      <header className="mb-4 flex items-center gap-2">
        <button
          type="button"
          aria-label="Back"
          onClick={goBack}
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-2xl active:bg-line"
        >
          ←
        </button>
        <h1 className="text-lg font-semibold">Needs details</h1>
      </header>

      {drafts && drafts.length === 0 && (
        <p className="pt-10 text-center text-sm text-muted">Nothing needs details. You&rsquo;re all caught up.</p>
      )}

      <ul className="space-y-2 pb-10">
        {drafts?.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-2 rounded-2xl bg-card p-2 shadow-sm ring-1 ring-line"
          >
            <Link to={`/match/${item.id}`} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-xl active:bg-chip">
              <Cover title={item.title} url={item.coverUrl} className="h-14 w-10 shrink-0" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{item.title}</span>
                <span className="block truncate text-xs text-muted">
                  {TYPE_LABEL[item.type]} · Tap to find details
                </span>
              </span>
            </Link>
            <button
              type="button"
              onClick={() => keep(item)}
              className="min-h-11 shrink-0 rounded-xl px-3 text-sm font-medium ring-1 ring-line active:bg-chip"
            >
              Keep
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
