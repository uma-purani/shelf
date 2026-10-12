import { useCallback, useEffect, useState } from 'react'
import { useToast } from '../../components/Toast'
import { downloadTextFile } from '../../data/download'
import { requestPersistence } from '../../data/db'
import { daysSince } from '../../domain/backup'
import { useGoBack } from '../../hooks/useGoBack'
import { useHealth } from '../../hooks/useHealth'
import {
  collectDiagnostics,
  diagnose,
  formatBytes,
  rescueBackup,
  type DiagnosticsReport,
} from '../../services/storageDiagnostics'

const TONE = {
  good: 'bg-accent-soft text-accent-soft-ink',
  warn: 'bg-warn-soft text-warn-ink',
  bad: 'bg-warn-soft text-warn-ink ring-2 ring-danger',
} as const

/**
 * Storage check: what the browser is actually holding for this address, in plain words,
 * plus a rescue copy that reads the raw database directly. Built to keep working when the
 * app's own data layer is the thing that's broken.
 */
export default function DiagnosticsScreen() {
  const goBack = useGoBack()
  const toast = useToast()
  const [report, setReport] = useState<DiagnosticsReport | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = useCallback(async () => {
    setFailure(null)
    try {
      setReport(await collectDiagnostics())
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e))
    }
  }, [])
  useEffect(() => {
    void run()
  }, [run])

  const verdict = report ? diagnose(report) : null
  const rawItems = report?.shelf.status === 'opened' ? (report.shelf.stores.find((s) => s.name === 'items')?.count ?? 0) : 0

  async function saveRescue() {
    setBusy(true)
    try {
      const { text, fileName, itemCount } = await rescueBackup()
      downloadTextFile(text, fileName)
      toast.show(`Saved ${fileName} (${itemCount} ${itemCount === 1 ? 'item' : 'items'})`)
    } catch (e) {
      toast.show(`Couldn't save a rescue copy: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      setBusy(false)
    }
  }

  async function protect() {
    const granted = await requestPersistence()
    toast.show(
      granted
        ? 'Done: the browser has promised to keep this data.'
        : "The browser didn't agree. Installing Shelf to your home screen usually helps. Keep backing up.",
    )
    void run()
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-16 pt-4">
      <header className="mb-4 flex items-center gap-2">
        <button
          type="button"
          aria-label="Back"
          onClick={goBack}
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-2xl active:bg-line"
        >
          ←
        </button>
        <h1 className="text-lg font-semibold">Storage check</h1>
      </header>

      {failure && (
        <p role="alert" className="mb-4 rounded-2xl bg-warn-soft p-4 text-sm text-warn-ink">
          The check itself failed: {failure}
        </p>
      )}
      {!report && !failure && <p className="text-sm text-muted">Checking…</p>}

      {report && verdict && (
        <div className="space-y-4">
          <section className={`rounded-2xl p-4 ${TONE[verdict.tone]}`} aria-label="Result">
            <p className="text-sm font-semibold">{verdict.headline}</p>
            {verdict.details.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {verdict.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
          </section>

          <div className="space-y-2">
            <button
              type="button"
              disabled={busy || rawItems === 0}
              onClick={saveRescue}
              className="min-h-12 w-full rounded-xl bg-accent text-base font-semibold text-on-accent active:opacity-70 disabled:opacity-40"
            >
              {rawItems > 0 ? `Save a rescue copy (${rawItems} items)` : 'Save a rescue copy (nothing to save)'}
            </button>
            <button
              type="button"
              onClick={protect}
              className="min-h-12 w-full rounded-xl text-base font-medium ring-1 ring-line active:bg-chip"
            >
              Ask the browser to keep my data
            </button>
            <button
              type="button"
              onClick={() => void run()}
              className="min-h-11 w-full rounded-xl text-sm font-medium text-accent active:bg-chip"
            >
              Check again
            </button>
          </div>

          <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line" aria-label="Details">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Details</h2>
            <dl className="space-y-2 text-sm">
              <Row label="Address" value={report.origin} />
              <Row label="Running as" value={report.standalone ? 'Installed app' : 'Browser tab'} />
              <Row label="Secure (https)" value={report.secure ? 'Yes' : 'No'} />
              <Row
                label="Browser keeps data"
                value={report.persisted === null ? "Can't tell" : report.persisted ? 'Promised' : 'Not promised'}
              />
              <Row
                label="Space used"
                value={`${formatBytes(report.estimate?.usage)} of ${formatBytes(report.estimate?.quota)}`}
              />
              {report.estimate?.indexedDB !== undefined && (
                <Row label="…in the database" value={formatBytes(report.estimate.indexedDB)} />
              )}
              {report.estimate?.caches !== undefined && (
                <Row label="…in cached files" value={formatBytes(report.estimate.caches)} />
              )}
              <Row
                label="Databases here"
                value={
                  report.databases === 'unsupported'
                    ? "Can't list"
                    : report.databases.length === 0
                      ? 'None'
                      : report.databases.map((d) => `${d.name} (v${d.version ?? '?'})`).join(', ')
                }
              />
              <Row label="Shelf database" value={describeShelf(report)} />
              <Row
                label="App can open it"
                value={report.app.ok ? `Yes: ${report.app.items} items, ${report.app.logs} logs, ${report.app.quotes} quotes` : `No: ${report.app.error}`}
              />
              <Row
                label="Offline worker"
                value={report.serviceWorker.registered ? `${report.serviceWorker.state ?? 'registered'}${report.serviceWorker.controlling ? ', in control' : ''}` : 'Not installed'}
              />
              <Row
                label="Cached files"
                value={report.caches.length === 0 ? 'None' : report.caches.map((c) => `${c.name}: ${c.entries}`).join(', ')}
              />
              <Row
                label="Last backup"
                value={
                  report.lastBackupAt
                    ? `${new Date(report.lastBackupAt).toLocaleDateString()} (${daysSince(report.lastBackupAt, new Date())} days ago)`
                    : 'Never exported'
                }
              />
            </dl>
          </section>
          <HistoryCard />
        </div>
      )}
    </div>
  )
}

/** Recent launches and storage errors recorded by the app itself: the evidence after a loss. */
function HistoryCard() {
  const health = useHealth()
  const launches = [...health.launches].reverse().slice(0, 10)
  const events = [...health.events].reverse().slice(0, 8)
  const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })

  return (
    <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line" aria-label="History">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Recent launches</h2>
      {health.lastKnown && (
        <p className="mb-2 text-xs text-muted">
          Last seen with {health.lastKnown.items} {health.lastKnown.items === 1 ? 'item' : 'items'} ({when(health.lastKnown.at)}).
        </p>
      )}
      {launches.length === 0 ? (
        <p className="text-sm text-muted">Nothing recorded yet. Launches are recorded from now on.</p>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {launches.map((l) => (
            <li key={l.at} className="flex flex-wrap gap-x-2">
              <span className="font-medium">{when(l.at)}</span>
              <span>
                {l.items} items, {l.logs} logs
              </span>
              <span className="text-muted">
                {l.standalone ? 'app' : 'tab'} · {l.persisted === null ? 'keep: ?' : l.persisted ? 'protected' : 'not protected'} ·{' '}
                {formatBytes(l.indexedDBUsage)} db / {formatBytes(l.cachesUsage)} files
              </span>
            </li>
          ))}
        </ul>
      )}
      {events.length > 0 && (
        <>
          <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Recent problems</h3>
          <ul className="space-y-1 text-xs">
            {events.map((e, i) => (
              <li key={`${e.at}-${i}`} className="break-words">
                <span className="font-medium">{when(e.at)}</span> · {e.kind}: <span className="text-muted">{e.message}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function describeShelf(r: DiagnosticsReport): string {
  const s = r.shelf
  if (s.status === 'missing') return 'Does not exist'
  if (s.status === 'unknown') return s.reason
  if (s.status === 'error') return `Error: ${s.error}`
  return `Exists (v${s.version}): ${s.stores.map((x) => `${x.name} ${x.count}`).join(', ')}`
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words font-medium">{value}</dd>
    </div>
  )
}
