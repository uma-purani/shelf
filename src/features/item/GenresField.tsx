import { useId, useState } from 'react'
import { MAX_GENRES_PER_ITEM, normalizeGenres } from '../../domain/genres'

/**
 * Genres as removable chips plus an add box (Enter or the Add button). Typing several at once,
 * separated by commas, adds them all. Suggestions come from the standard list and your library.
 */
export function GenresField({
  genres,
  suggestions,
  onChange,
}: {
  genres: string[]
  suggestions: string[]
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const listId = useId()
  const full = genres.length >= MAX_GENRES_PER_ITEM
  const available = suggestions.filter((s) => !genres.some((g) => g.toLowerCase() === s.toLowerCase()))

  const add = () => {
    if (!draft.trim()) return
    onChange(normalizeGenres([...genres, ...draft.split(',')]))
    setDraft('')
  }

  return (
    <div>
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">Genres</span>

      {genres.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2" aria-label="Genres">
          {genres.map((g) => (
            <li key={g} className="flex items-center rounded-full bg-chip pl-3 text-sm">
              {g}
              <button
                type="button"
                aria-label={`Remove ${g}`}
                onClick={() => onChange(genres.filter((x) => x !== g))}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted active:bg-line"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          list={listId}
          disabled={full}
          autoComplete="off"
          aria-label="Add a genre"
          placeholder={full ? 'Genre limit reached' : 'Add a genre, e.g. Mystery'}
          className="min-h-11 min-w-0 flex-1 rounded-xl bg-card px-3 text-sm outline-none ring-1 ring-line focus:ring-2 focus:ring-accent disabled:opacity-50"
        />
        <datalist id={listId}>
          {available.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button
          type="submit"
          disabled={!draft.trim() || full}
          className="min-h-11 rounded-xl px-4 text-sm font-medium ring-1 ring-line active:bg-chip disabled:opacity-40"
        >
          Add
        </button>
      </form>
    </div>
  )
}
