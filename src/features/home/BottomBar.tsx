import { useState } from 'react'
import type { ItemType } from '../../domain/types'

interface NotePromptProps {
  title: string
  onSave: (notes: string) => void
  onDismiss: () => void
}

/** Optional note after finishing. Ignoring it costs nothing; it saves on Enter or blur. */
export function NotePrompt({ title, onSave, onDismiss }: NotePromptProps) {
  const [value, setValue] = useState('')
  const commit = () => {
    if (value.trim()) onSave(value)
    onDismiss()
  }
  return (
    <div className="mx-auto flex w-full max-w-md items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-md ring-1 ring-stone-200 dark:bg-stone-800 dark:ring-stone-700">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        onBlur={commit}
        placeholder={`Note on ${title} (optional)`}
        aria-label={`Note on ${title}`}
        className="min-h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:opacity-50"
      />
      <button
        type="button"
        aria-label="Skip note"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg opacity-60 active:bg-stone-100 dark:active:bg-stone-700"
        onPointerDown={(e) => e.preventDefault()}
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  )
}

const TYPES: Array<{ value: ItemType; label: string }> = [
  { value: 'book', label: 'Book' },
  { value: 'movie', label: 'Movie' },
  { value: 'show', label: 'Show' },
]

/**
 * TEMPORARY add-by-title bar so the home screen can be exercised before
 * search add and quick capture exist (increments 3 and 4). It will be replaced.
 */
export function TempAddBar({ onAdd }: { onAdd: (title: string, type: ItemType) => void }) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<ItemType>('book')

  const submit = () => {
    if (!title.trim()) return
    onAdd(title, type)
    setTitle('')
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2" role="radiogroup" aria-label="Type">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={type === t.value}
            onClick={() => setType(t.value)}
            className={`min-h-9 flex-1 rounded-full text-sm ${
              type === t.value
                ? 'bg-stone-900 font-semibold text-white dark:bg-stone-100 dark:text-stone-900'
                : 'bg-stone-200 dark:bg-stone-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a title (temporary)"
          aria-label="Title"
          className="min-h-11 min-w-0 flex-1 rounded-xl bg-white px-3 text-base ring-1 ring-stone-300 outline-none focus:ring-2 focus:ring-amber-500 dark:bg-stone-900 dark:ring-stone-700"
        />
        <button type="submit" className="min-h-11 rounded-xl bg-amber-500 px-5 font-semibold text-stone-950 active:opacity-70">
          Add
        </button>
      </form>
    </div>
  )
}
