interface Props {
  label: string
  /** "YYYY-MM-DD" or undefined for no date. */
  value: string | undefined
  min?: string
  max?: string
  /** Called with the new "YYYY-MM-DD", or "" when the user cleared the field. */
  onChange: (value: string) => void
  /** Bump to force the field back to `value` (after a rejected edit). */
  resetKey?: number
}

/**
 * Native date picker (the phone's own calendar). `min`/`max` steer the picker; the
 * real rules are enforced when the value is saved. Uncontrolled and re-keyed by the saved
 * value, so it always shows what is actually stored.
 */
export function DateField({ label, value, min, max, onChange, resetKey = 0 }: Props) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      <input
        key={`${value ?? ''}|${resetKey}`}
        type="date"
        defaultValue={value ?? ''}
        min={min}
        max={max}
        onChange={(e) => onChange(e.currentTarget.value)}
        className="min-h-11 w-full min-w-0 rounded-xl bg-card px-3 text-sm outline-none ring-1 ring-line focus:ring-2 focus:ring-accent"
      />
    </label>
  )
}
