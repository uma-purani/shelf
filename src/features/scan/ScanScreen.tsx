import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { useToast } from '../../components/Toast'
import { db } from '../../data/db'
import { useGoBack } from '../../hooks/useGoBack'
import { isbnFromImage, scanSupport, type ScanSupport } from '../../services/barcode'
import { isbnService, type ScanOutcome } from '../../services/isbn'
import { CameraScanner } from './CameraScanner'

interface ResultRow {
  id: number
  label: string
  detail: string
}

const MAX_ROWS = 6
const card = 'rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line'
const secondaryBtn = 'min-h-12 w-full rounded-xl text-base font-medium ring-1 ring-line active:bg-chip disabled:opacity-50'

/** What to tell the user about a scan result, and the row to show in the session list. */
function describeOutcome(outcome: ScanOutcome, isbn: string): { message: string; row: Omit<ResultRow, 'id'> } {
  switch (outcome.kind) {
    case 'added':
      return {
        message: `Added “${outcome.item.title}” to Want`,
        row: { label: outcome.item.title, detail: 'Added to Want' },
      }
    case 'draft':
      return {
        message: `Not found. Saved ISBN ${isbn} as a draft`,
        row: { label: `ISBN ${isbn}`, detail: 'Saved as a draft: fill in details later' },
      }
    case 'exists':
      return {
        message: `“${outcome.item.title}” is already on your shelf`,
        row: { label: outcome.item.title, detail: 'Already on your shelf' },
      }
    case 'queued':
      return {
        message: "You're offline: saved the ISBN to look up later",
        row: { label: `ISBN ${isbn}`, detail: 'Waiting for a connection' },
      }
    case 'invalid':
      return {
        message: "That doesn't look like a valid ISBN",
        row: { label: isbn, detail: 'Not a valid ISBN' },
      }
  }
}

export default function ScanScreen() {
  const goBack = useGoBack()
  const toast = useToast()
  const [support, setSupport] = useState<ScanSupport | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [typed, setTyped] = useState('')
  const [rows, setRows] = useState<ResultRow[]>([])
  const [busyPhoto, setBusyPhoto] = useState(false)
  const nextRow = useRef(0)
  const photoInput = useRef<HTMLInputElement>(null)

  const waiting = useLiveQuery(() => db.pendingLookups.count(), [])

  useEffect(() => {
    let cancelled = false
    void scanSupport().then((s) => {
      if (cancelled) return
      setSupport(s)
      if (s.ok) setCameraOn(true) // open straight to the camera when it can work
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleIsbn(raw: string) {
    try {
      const outcome = await isbnService.scan(raw)
      const isbn = raw.replace(/[\s-]/g, '')
      const { message, row } = describeOutcome(outcome, outcome.kind === 'queued' ? outcome.isbn : isbn)
      setRows((prev) => [{ id: ++nextRow.current, ...row }, ...prev].slice(0, MAX_ROWS))
      toast.show(message, 'undo' in outcome ? outcome.undo : undefined)
    } catch (e) {
      toast.show(`Couldn't add that: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }

  async function handlePhoto(file: File) {
    setBusyPhoto(true)
    try {
      const isbn = await isbnFromImage(file)
      if (!isbn) toast.show("Couldn't find an ISBN barcode in that photo. Try a closer, sharper one.")
      else await handleIsbn(isbn)
    } catch (e) {
      toast.show(`Couldn't read that photo: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      setBusyPhoto(false)
      if (photoInput.current) photoInput.current.value = ''
    }
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-4">
      <header className="mb-4 flex items-center gap-2">
        <button
          type="button"
          aria-label="Back"
          onClick={goBack}
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-2xl active:bg-line"
        >
          ←
        </button>
        <h1 className="text-lg font-semibold">Scan a book</h1>
      </header>

      <div className="space-y-4">
        {support && !support.ok && (
          <p role="note" className="rounded-2xl bg-warn-soft p-4 text-sm text-warn-ink">
            {support.message}
          </p>
        )}

        {support?.ok && (
          <section aria-label="Camera and photo" className="space-y-3">
            {cameraOn ? (
              <CameraScanner onIsbn={(isbn) => void handleIsbn(isbn)} onStop={() => setCameraOn(false)} />
            ) : (
              <button
                type="button"
                onClick={() => setCameraOn(true)}
                className="min-h-14 w-full rounded-xl bg-accent text-base font-semibold text-on-accent active:opacity-70"
              >
                Start camera
              </button>
            )}

            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              aria-label="Photo of a barcode"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handlePhoto(file)
              }}
            />
            <button type="button" disabled={busyPhoto} onClick={() => photoInput.current?.click()} className={secondaryBtn}>
              {busyPhoto ? 'Reading photo…' : 'Pick a photo of a barcode'}
            </button>
          </section>
        )}

        <section className={card} aria-label="Type an ISBN">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Or type the ISBN</h2>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!typed.trim()) return
              void handleIsbn(typed)
              setTyped('')
            }}
          >
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="978-0-441-17271-9"
              aria-label="ISBN"
              inputMode="text"
              autoComplete="off"
              className="min-h-11 min-w-0 flex-1 rounded-xl bg-bg px-3 text-base outline-none ring-1 ring-line focus:ring-2 focus:ring-accent"
            />
            <button
              type="submit"
              disabled={!typed.trim()}
              className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent active:opacity-70 disabled:opacity-40"
            >
              Add
            </button>
          </form>
        </section>

        {waiting ? (
          <p role="status" className="px-1 text-sm text-muted">
            {waiting} {waiting === 1 ? 'scan is' : 'scans are'} waiting for a connection and will be added automatically.
          </p>
        ) : null}

        {rows.length > 0 && (
          <section aria-label="This session">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">This session</h2>
            <ul className="space-y-2">
              {rows.map((r) => (
                <li key={r.id} className="rounded-xl bg-card px-3 py-2 ring-1 ring-line">
                  <p className="truncate text-sm font-medium">{r.label}</p>
                  <p className="truncate text-xs text-muted">{r.detail}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
