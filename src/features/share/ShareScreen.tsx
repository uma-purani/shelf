import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../../components/Toast'
import { isbnFromImage, scanSupport } from '../../services/barcode'
import { describeBatch, scanPhotos, type BatchSummary } from '../../services/batchScan'
import { isbnService } from '../../services/isbn'
import { takeSharedPhotos } from '../../services/sharedPhotos'

type Phase =
  | { kind: 'working'; done: number; total: number }
  | { kind: 'empty' }
  | { kind: 'unsupported'; message: string }
  | { kind: 'done'; summary: BatchSummary }
  | { kind: 'error'; message: string }

const linkBtn = 'flex min-h-12 w-full items-center justify-center rounded-xl text-base font-semibold'

/**
 * Landing screen for photos shared into Shelf from another app (Android share sheet).
 * The service worker stashed them; here they are read once, scanned and added to the Queue.
 */
export default function ShareScreen() {
  const toast = useToast()
  const [phase, setPhase] = useState<Phase>({ kind: 'working', done: 0, total: 0 })
  const started = useRef(false) // StrictMode runs effects twice in dev; a share must be processed once

  useEffect(() => {
    if (started.current) return
    started.current = true

    void (async () => {
      try {
        const support = await scanSupport()
        if (!support.ok) return setPhase({ kind: 'unsupported', message: support.message })

        const photos = await takeSharedPhotos()
        if (photos.length === 0) return setPhase({ kind: 'empty' })

        setPhase({ kind: 'working', done: 0, total: photos.length })
        const summary = await scanPhotos(photos, {
          detect: isbnFromImage,
          scan: (isbn) => isbnService.scan(isbn),
          onProgress: (done, total) => setPhase({ kind: 'working', done, total }),
        })
        setPhase({ kind: 'done', summary })
        const created = summary.added.length + summary.drafts.length
        toast.show(describeBatch(summary), created > 0 ? summary.undo : undefined)
      } catch (e) {
        setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'unknown error' })
      }
    })()
  }, [toast])

  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-16 pt-6">
      <h1 className="mb-4 text-lg font-semibold">Shared to Shelf</h1>

      {phase.kind === 'working' && (
        <p role="status" className="rounded-2xl bg-card p-4 text-sm shadow-sm ring-1 ring-line">
          {phase.total > 0
            ? `Reading photo ${Math.min(phase.done + 1, phase.total)} of ${phase.total}…`
            : 'Getting your photos…'}
        </p>
      )}

      {phase.kind === 'empty' && (
        <p className="rounded-2xl bg-card p-4 text-sm text-muted shadow-sm ring-1 ring-line">
          No photos came through. Share a photo of a book&rsquo;s barcode from your gallery, or scan one here.
        </p>
      )}

      {phase.kind === 'unsupported' && (
        <p role="note" className="rounded-2xl bg-warn-soft p-4 text-sm text-warn-ink">
          {phase.message}
        </p>
      )}

      {phase.kind === 'error' && (
        <p role="alert" className="rounded-2xl bg-warn-soft p-4 text-sm text-warn-ink">
          Couldn&rsquo;t process the shared photos: {phase.message}
        </p>
      )}

      {phase.kind === 'done' && (
        <section className="space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line" aria-label="Result">
          <p className="text-sm font-medium">{describeBatch(phase.summary)}</p>
          {phase.summary.added.length > 0 && (
            <ul className="space-y-1 text-sm">
              {phase.summary.added.map((item) => (
                <li key={item.id} className="truncate">
                  {item.title}
                  {item.creator ? <span className="text-muted"> · {item.creator}</span> : null}
                </li>
              ))}
            </ul>
          )}
          {phase.summary.drafts.length > 0 && (
            <p className="text-xs text-muted">Drafts are in &ldquo;Needs details&rdquo; on the home screen.</p>
          )}
        </section>
      )}

      <div className="mt-6 space-y-2">
        <Link to="/scan" replace className={`${linkBtn} ring-1 ring-line active:bg-chip`}>
          Scan more
        </Link>
        <Link to="/" replace className={`${linkBtn} bg-accent text-on-accent active:opacity-70`}>
          Go to Shelf
        </Link>
      </div>
    </div>
  )
}
