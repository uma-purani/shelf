import { useRef, useState } from 'react'
import { useToast } from '../../components/Toast'
import { repo } from '../../data/repo'
import type { ItemType } from '../../domain/types'
import { useGoBack } from '../../hooks/useGoBack'

const TYPES: Array<{ value: ItemType; label: string }> = [
  { value: 'book', label: 'Book' },
  { value: 'movie', label: 'Movie' },
  { value: 'show', label: 'Show' },
]
const LAST_TYPE_KEY = 'shelf.lastCaptureType'

function loadLastType(): ItemType {
  try {
    const v = localStorage.getItem(LAST_TYPE_KEY)
    if (v === 'book' || v === 'movie' || v === 'show') return v
  } catch {
    /* storage unavailable: fall back to the default */
  }
  return 'book'
}

/**
 * Quick capture: a title and a type chip, saved as a draft in the Queue.
 * No network needed. Stays open after saving so several can be captured in a row.
 */
export default function CaptureScreen() {
  const goBack = useGoBack()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [type, setType] = useState<ItemType>(loadLastType)
  const inputRef = useRef<HTMLInputElement>(null)

  const choose = (t: ItemType) => {
    setType(t)
    try {
      localStorage.setItem(LAST_TYPE_KEY, t)
    } catch {
      /* not critical */
    }
    inputRef.current?.focus()
  }

  async function save() {
    if (!title.trim()) return
    try {
      const item = await repo.addItem({ type, title, isDraft: true })
      setTitle('')
      inputRef.current?.focus()
      toast.show(`Saved “${item.title}” to Queue`, async () => void (await repo.deleteItem(item.id)))
    } catch (e) {
      toast.show(`Couldn't save: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-4">
      <header className="mb-6 flex items-center gap-2">
        <button
          type="button"
          aria-label="Back"
          onClick={goBack}
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-2xl active:bg-line"
        >
          ←
        </button>
        <h1 className="text-lg font-semibold">Quick capture</h1>
      </header>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <input
          ref={inputRef}
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          aria-label="Title"
          enterKeyHint="done"
          autoComplete="off"
          className="min-h-14 w-full rounded-xl bg-card px-4 text-lg ring-1 ring-line outline-none focus:ring-2 focus:ring-accent"
        />

        <div className="flex gap-2" role="radiogroup" aria-label="Type">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={type === t.value}
              onClick={() => choose(t.value)}
              className={`min-h-12 flex-1 rounded-full text-base ${
                type === t.value
                  ? 'bg-ink font-semibold text-bg'
                  : 'bg-chip'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          type="submit"
          disabled={!title.trim()}
          className="min-h-14 w-full rounded-xl bg-accent text-lg font-semibold text-on-accent active:opacity-70 disabled:opacity-40"
        >
          Save
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-muted">
        Saved as a draft in your Queue. Add details later from “Needs details”.
      </p>
    </div>
  )
}
