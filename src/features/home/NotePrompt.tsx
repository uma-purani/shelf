import { useState } from 'react'

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
