import { useState } from 'react'

/** A saved passage with its optional location. */
export function QuoteText({ text, location }: { text: string; location?: string }) {
  return (
    <blockquote className="border-l-2 border-accent pl-3">
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
      {location && <footer className="mt-1 text-xs text-muted">{location}</footer>}
    </blockquote>
  )
}

const field =
  'w-full rounded-xl bg-card px-3 text-sm outline-none ring-1 ring-line focus:ring-2 focus:ring-accent'

/**
 * Add-a-quote form. Only the text is required; location (page, chapter, episode,
 * timestamp) can be left blank.
 */
export function QuoteForm({
  onSave,
  onCancel,
}: {
  onSave: (text: string, location: string) => Promise<void>
  onCancel: () => void
}) {
  const [text, setText] = useState('')
  const [location, setLocation] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!text.trim() || saving) return
    setSaving(true)
    try {
      await onSave(text, location)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="space-y-2 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-line"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="The passage or line"
        aria-label="Quote"
        className={`${field} min-h-24 py-2`}
      />
      <input
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder="Location, e.g. p. 142, ch. 3, S2E4, 0:42:10 (optional)"
        aria-label="Location"
        autoComplete="off"
        className={`${field} min-h-11`}
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!text.trim() || saving}
          className="min-h-11 flex-1 rounded-xl bg-accent text-sm font-semibold text-on-accent active:opacity-70 disabled:opacity-40"
        >
          Save quote
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-xl px-4 text-sm font-medium ring-1 ring-line active:bg-chip"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
