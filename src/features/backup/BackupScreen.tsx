import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../../components/Toast'
import { ImportError, importBackup } from '../../data/backupIo'
import { db } from '../../data/db'
import { SETTING_KEYS } from '../../data/settings'
import { daysSince } from '../../domain/backup'
import { useGoBack } from '../../hooks/useGoBack'
import { backUpNow, canShareBackup, describeBackUp, exportNow } from './exportAction'

const card = 'rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line'
const primary =
  'min-h-12 w-full rounded-xl bg-accent text-base font-semibold text-on-accent active:opacity-70 disabled:opacity-50'

export default function BackupScreen() {
  const goBack = useGoBack()
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [lastImport, setLastImport] = useState<string | null>(null)

  const info = useLiveQuery(async () => {
    const last = await db.settings.get(SETTING_KEYS.lastBackupAt)
    return { lastBackupAt: last?.value as string | undefined, itemCount: await db.items.count() }
  }, [])

  const days = daysSince(info?.lastBackupAt, new Date())
  const lastText =
    info?.lastBackupAt === undefined
      ? 'Never exported'
      : `${new Date(info.lastBackupAt).toLocaleDateString(undefined, { dateStyle: 'medium' })} (${
          days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
        })`

  const canShare = canShareBackup()

  async function doBackUp() {
    setBusy('export')
    try {
      toast.show(describeBackUp(await backUpNow()))
    } catch (e) {
      toast.show(`Couldn't back up: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      setBusy(null)
    }
  }

  async function doExport() {
    setBusy('export')
    try {
      const { fileName, itemCount } = await exportNow()
      toast.show(`Saved ${fileName} (${itemCount} ${itemCount === 1 ? 'item' : 'items'}). Copy it off this phone too.`)
    } catch (e) {
      toast.show(`Couldn't export: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      setBusy(null)
    }
  }

  async function doImport(file: File) {
    setBusy('import')
    setImportError(null)
    setLastImport(null)
    try {
      const { message, undo } = await importBackup(await file.text())
      setLastImport(message)
      toast.show(message, async () => {
        await undo()
        setLastImport(null)
      })
    } catch (e) {
      setImportError(e instanceof ImportError ? e.message : `Couldn't read that file: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      setBusy(null)
      if (fileInput.current) fileInput.current.value = '' // allow picking the same file again
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
        <h1 className="text-lg font-semibold">Backup</h1>
      </header>

      <p className="mb-4 px-1 text-sm text-muted">
        Everything lives on this phone. A backup is a single file you can keep anywhere.
      </p>

      <div className="space-y-4">
        <section className={card} aria-label="Export">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Export</h2>
          <p className="mt-2 text-sm">
            Last backup: <span className="font-medium">{lastText}</span>
          </p>
          <p className="mt-1 text-xs text-muted">
            {info?.itemCount ?? 0} {info?.itemCount === 1 ? 'item' : 'items'} with all logs, ratings, notes and quotes.
          </p>
          {canShare ? (
            <>
              <button type="button" onClick={doBackUp} disabled={busy !== null} className={`${primary} mt-3`}>
                {busy === 'export' ? 'Preparing…' : 'Send backup to…'}
              </button>
              <p className="mt-2 text-xs text-muted">
                Opens your phone&rsquo;s share sheet: pick Drive, email, or a chat with yourself, so the file is
                stored outside this phone.
              </p>
              <button
                type="button"
                onClick={doExport}
                disabled={busy !== null}
                className="mt-2 min-h-11 w-full rounded-xl text-sm font-medium ring-1 ring-line active:bg-chip disabled:opacity-50"
              >
                Download a file instead
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={doExport} disabled={busy !== null} className={`${primary} mt-3`}>
                {busy === 'export' ? 'Exporting…' : 'Export backup'}
              </button>
              <p className="mt-2 text-xs text-muted">
                This browser won&rsquo;t open the share sheet for files, so the backup downloads to this phone. Afterwards,
                open your Files app and send or upload that file somewhere outside the phone (Drive, email). A copy
                that stays on the phone is lost if the phone clears Chrome&rsquo;s data.
              </p>
            </>
          )}
        </section>

        <section className={card} aria-label="Import">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Import</h2>
          <p className="mt-2 text-sm">
            Pick a backup file to merge into your library. Records are matched by ID and the more recently edited
            version wins. Importing never deletes anything, and you can undo it right after.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json,text/plain,.txt"
            aria-label="Backup file"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void doImport(file)
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy !== null}
            className="mt-3 min-h-12 w-full rounded-xl text-base font-semibold ring-1 ring-line active:bg-chip disabled:opacity-50"
          >
            {busy === 'import' ? 'Importing…' : 'Choose backup file'}
          </button>

          {importError && (
            <p role="alert" className="mt-3 rounded-xl bg-warn-soft p-3 text-sm text-warn-ink">
              {importError}
            </p>
          )}
          {lastImport && !importError && <p className="mt-3 text-sm text-accent">{lastImport}</p>}
        </section>

        <Link
          to="/diagnostics"
          className="flex min-h-12 items-center justify-center rounded-xl text-sm font-medium text-accent ring-1 ring-line active:bg-chip"
        >
          Storage check: is my data safe?
        </Link>
      </div>
    </div>
  )
}
