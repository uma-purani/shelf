import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../../data/db'
import { searchQuotes } from '../../domain/quotes'
import { useGoBack } from '../../hooks/useGoBack'
import { QuoteText } from './QuoteParts'

/** Every saved quote across all items, newest first, searchable. */
export default function QuotesScreen() {
  const goBack = useGoBack()
  const [query, setQuery] = useState('')
  const quotes = useLiveQuery(() => db.quotes.toArray(), [])
  const items = useLiveQuery(() => db.items.toArray(), [])

  const results = useMemo(
    () => (quotes && items ? searchQuotes(quotes, items, query) : undefined),
    [quotes, items, query],
  )
  const total = quotes?.length ?? 0

  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-16 pt-4">
      <header className="sticky top-0 z-10 -mx-4 mb-3 space-y-2 bg-bg/95 px-4 pb-3 pt-0 backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Back"
            onClick={goBack}
            className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl active:bg-line"
          >
            ←
          </button>
          <h1 className="text-lg font-semibold">Quotes</h1>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search quotes, titles, locations"
          aria-label="Search quotes"
          className="min-h-11 w-full rounded-xl bg-card px-3 text-base outline-none ring-1 ring-line focus:ring-2 focus:ring-accent"
        />
      </header>

      {results && total === 0 && (
        <p className="pt-10 text-center text-sm text-muted">
          No quotes yet. Open any item and tap &ldquo;Add quote&rdquo;.
        </p>
      )}
      {results && total > 0 && results.length === 0 && (
        <p className="pt-10 text-center text-sm text-muted">No quotes match &ldquo;{query.trim()}&rdquo;.</p>
      )}

      <ul className="space-y-4">
        {results?.map(({ quote, item }) => (
          <li key={quote.id} className="space-y-2 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line">
            <QuoteText text={quote.text} location={quote.location} />
            <Link
              to={`/item/${item.id}`}
              className="inline-flex min-h-9 items-center text-xs font-medium text-accent active:opacity-70"
            >
              {item.title}
              {item.creator ? ` · ${item.creator}` : ''}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
