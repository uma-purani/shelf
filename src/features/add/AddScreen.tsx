import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cover } from '../../components/Cover'
import { useToast } from '../../components/Toast'
import { db } from '../../data/db'
import { repo } from '../../data/repo'
import { useDebounce } from '../../hooks/useDebounce'
import type { SearchResult } from '../../services/mappers'
import { searchAll, type SearchOutcome } from '../../services/search'

type SearchState =
  | { status: 'idle' }
  | { status: 'offline' }
  | { status: 'loading' }
  | { status: 'done'; outcome: SearchOutcome }

const TYPE_LABEL = { book: 'Book', movie: 'Movie', show: 'Show' } as const
const STATUS_LABEL = { want: 'Want', in_progress: 'In progress', finished: 'Finished', dropped: 'Dropped' } as const
const MIN_CHARS = 2

export default function AddScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  // Opened directly (e.g. from a shortcut) there is nothing to go back to: land on Home instead of leaving the app.
  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/', { replace: true }))
  const [query, setQuery] = useState('')
  const [recommendedBy, setRecommendedBy] = useState('')
  const [state, setState] = useState<SearchState>({ status: 'idle' })
  const debounced = useDebounce(query.trim(), 300)

  const items = useLiveQuery(() => db.items.toArray(), [])
  const onShelf = useMemo(() => {
    const map = new Map<string, keyof typeof STATUS_LABEL>()
    for (const i of items ?? []) if (i.externalId) map.set(i.externalId, i.status)
    return map
  }, [items])
  const pastRecommenders = useMemo(
    () => [...new Set((items ?? []).map((i) => i.recommendedBy).filter((r): r is string => !!r))].sort(),
    [items],
  )

  useEffect(() => {
    if (debounced.length < MIN_CHARS) {
      setState({ status: 'idle' })
      return
    }
    if (!navigator.onLine) {
      setState({ status: 'offline' })
      return
    }
    const controller = new AbortController()
    setState({ status: 'loading' })
    searchAll(debounced, controller.signal).then(
      (outcome) => setState({ status: 'done', outcome }),
      (e) => {
        if (!controller.signal.aborted) setState({ status: 'done', outcome: { books: [], screen: [], failed: ['books', 'screen'] } })
        else void e
      },
    )
    return () => controller.abort()
  }, [debounced])

  async function add(result: SearchResult) {
    try {
      const { key: _key, ...input } = result
      const item = await repo.addItem({ ...input, recommendedBy: recommendedBy.trim() || undefined })
      toast.show(`Added â€œ${item.title}â€ to Want`, () => repo.deleteItem(item.id))
    } catch (e) {
      toast.show(`Couldn't add: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }

  const outcome = state.status === 'done' ? state.outcome : undefined
  const noResults = outcome && outcome.books.length === 0 && outcome.screen.length === 0

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="sticky top-0 z-10 space-y-2 bg-stone-50/95 px-4 pb-3 pt-4 backdrop-blur dark:bg-stone-950/95">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Back"
            onClick={goBack}
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-2xl active:bg-stone-200 dark:active:bg-stone-800"
          >
            â†
          </button>
          <input
            autoFocus
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search books, movies, shows"
            aria-label="Search"
            className="min-h-11 min-w-0 flex-1 rounded-xl bg-white px-3 text-base ring-1 ring-stone-300 outline-none focus:ring-2 focus:ring-amber-500 dark:bg-stone-900 dark:ring-stone-700"
          />
        </div>
        <input
          list="recommenders"
          value={recommendedBy}
          onChange={(e) => setRecommendedBy(e.target.value)}
          placeholder="Recommended by (optional)"
          aria-label="Recommended by"
          autoComplete="off"
          className="min-h-10 w-full rounded-xl bg-white px-3 text-sm ring-1 ring-stone-300 outline-none focus:ring-2 focus:ring-amber-500 dark:bg-stone-900 dark:ring-stone-700"
        />
        <datalist id="recommenders">
          {pastRecommenders.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </header>

      <main className="flex-1 space-y-5 px-4 pb-24">
        {state.status === 'idle' && (
          <p className="pt-6 text-center text-sm opacity-50">Type at least {MIN_CHARS} letters to search.</p>
        )}
        {state.status === 'offline' && (
          <p className="pt-6 text-center text-sm opacity-60">Search needs a connection. Try again when you're back online.</p>
        )}
        {state.status === 'loading' && <p className="pt-6 text-center text-sm opacity-50">Searchingâ€¦</p>}

        {outcome && (
          <>
            {outcome.failed.length > 0 && (
              <p className="rounded-xl bg-amber-100 p-3 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200" role="alert">
                {outcome.failed.length === 2
                  ? "Couldn't reach the search services."
                  : outcome.failed[0] === 'books'
                    ? "Book search is unavailable right now."
                    : "Movie and show search is unavailable right now."}
              </p>
            )}
            {noResults && outcome.failed.length === 0 && (
              <p className="pt-6 text-center text-sm opacity-50">No matches for â€œ{debounced}â€.</p>
            )}
            <ResultGroup title="Books" results={outcome.books} onShelf={onShelf} onAdd={add} />
            <ResultGroup title="Movies & shows" results={outcome.screen} onShelf={onShelf} onAdd={add} />
          </>
        )}
      </main>
    </div>
  )
}

function ResultGroup({
  title,
  results,
  onShelf,
  onAdd,
}: {
  title: string
  results: SearchResult[]
  onShelf: Map<string, keyof typeof STATUS_LABEL>
  onAdd: (r: SearchResult) => void
}) {
  if (results.length === 0) return null
  return (
    <section aria-label={title}>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide opacity-60">{title}</h2>
      <ul className="space-y-2">
        {results.map((r) => {
          const existing = onShelf.get(r.externalId)
          const meta = [TYPE_LABEL[r.type], r.creator, r.year].filter(Boolean).join(' Â· ')
          return (
            <li key={r.key}>
              <button
                type="button"
                disabled={existing !== undefined}
                onClick={() => onAdd(r)}
                className="flex min-h-[4.5rem] w-full items-center gap-3 rounded-2xl bg-white p-2 text-left shadow-sm ring-1 ring-stone-200 active:bg-stone-100 disabled:opacity-60 dark:bg-stone-900 dark:ring-stone-800 dark:active:bg-stone-800"
              >
                <Cover title={r.title} url={r.coverUrl} className="h-16 w-11 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.title}</span>
                  <span className="block truncate text-xs opacity-60">{meta}</span>
                </span>
                <span className="shrink-0 pr-1 text-xs font-medium">
                  {existing ? <span className="opacity-60">âœ“ {STATUS_LABEL[existing]}</span> : <span className="text-amber-600 dark:text-amber-400">+ Want</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
