import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { SaveOnBlurField } from '../../components/SaveOnBlurField'
import { useToast } from '../../components/Toast'
import { db } from '../../data/db'
import { repo } from '../../data/repo'
import type { Quote } from '../../domain/types'
import { QuoteForm, QuoteText } from './QuoteParts'

/** Quotes saved from one item: add, edit in place, delete (with Undo). */
export function ItemQuotes({ itemId }: { itemId: string }) {
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const quotes = useLiveQuery(
    async () => (await db.quotes.where('itemId').equals(itemId).toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [itemId],
  )

  const add = async (text: string, location: string) => {
    try {
      const { undo } = await repo.addQuote({ itemId, text, location })
      setAdding(false)
      toast.show('Quote saved', undo)
    } catch (e) {
      toast.show(`Couldn't save quote: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }

  return (
    <section className="mt-8" aria-label="Quotes">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Quotes</h2>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="-my-2 -mr-2 min-h-11 rounded-xl px-3 text-sm font-medium text-accent active:bg-chip"
          >
            + Add quote
          </button>
        )}
      </div>

      {adding && <QuoteForm onSave={add} onCancel={() => setAdding(false)} />}

      {quotes && quotes.length === 0 && !adding && (
        <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">
          No quotes saved from this one yet.
        </p>
      )}

      <ul className={`space-y-3 ${adding ? 'mt-3' : ''}`}>
        {quotes?.map((q) => (
          <QuoteRow key={q.id} quote={q} />
        ))}
      </ul>
    </section>
  )
}

function QuoteRow({ quote }: { quote: Quote }) {
  const toast = useToast()
  const [editing, setEditing] = useState(false)

  const save = async (edit: { text?: string; location?: string }) => {
    try {
      await repo.updateQuote(quote.id, edit)
    } catch (e) {
      toast.show(`Couldn't save: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }
  const remove = async () => {
    const { undo } = await repo.deleteQuote(quote.id)
    toast.show('Quote deleted', undo)
  }

  return (
    <li className="space-y-3 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-line">
      {editing ? (
        <>
          <SaveOnBlurField label="Quote" value={quote.text} multiline onSave={(text) => save({ text })} />
          <SaveOnBlurField
            label="Location"
            value={quote.location}
            placeholder="p. 142, ch. 3, S2E4…"
            onSave={(location) => save({ location })}
          />
        </>
      ) : (
        <QuoteText text={quote.text} location={quote.location} />
      )}
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="min-h-11 rounded-xl px-3 text-sm font-medium text-accent active:bg-chip"
        >
          {editing ? 'Done' : 'Edit'}
        </button>
        <button type="button" onClick={remove} className="min-h-11 rounded-xl px-3 text-sm font-medium text-danger active:bg-danger/10">
          Delete
        </button>
      </div>
    </li>
  )
}
