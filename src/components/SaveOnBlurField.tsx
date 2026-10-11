interface Props {
  label: string
  value: string | undefined
  onSave: (text: string) => void
  placeholder?: string
  multiline?: boolean
  list?: string
}

const base =
  'w-full rounded-xl bg-card px-3 text-sm outline-none ring-1 ring-line focus:ring-2 focus:ring-accent'

/**
 * Text field that saves when it loses focus (and only if the text changed).
 * Uncontrolled and re-keyed by the saved value, so it stays in sync after a save
 * without fighting the user's typing.
 */
export function SaveOnBlurField({ label, value, onSave, placeholder, multiline, list }: Props) {
  const save = (text: string) => {
    if (text.trim() !== (value ?? '')) onSave(text)
  }
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      {multiline ? (
        <textarea
          key={value ?? ''}
          defaultValue={value ?? ''}
          rows={3}
          placeholder={placeholder}
          onBlur={(e) => save(e.currentTarget.value)}
          className={`${base} min-h-20 py-2`}
        />
      ) : (
        <input
          key={value ?? ''}
          defaultValue={value ?? ''}
          list={list}
          autoComplete="off"
          placeholder={placeholder}
          onBlur={(e) => save(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className={`${base} min-h-11`}
        />
      )}
    </label>
  )
}
