import { useLiveQuery } from 'dexie-react-hooks'
import { useToast } from '../../components/Toast'
import { db } from '../../data/db'
import { setSetting, SETTING_KEYS } from '../../data/settings'
import { daysSince, shouldShowBackupReminder } from '../../domain/backup'
import { exportNow } from './exportAction'

/**
 * Quiet, dismissible reminder on Home: more than 30 days since the last export, or never
 * exported with at least 10 items. One tap exports. Dismissing hides it for a week.
 */
export function BackupBanner() {
  const toast = useToast()
  const state = useLiveQuery(async () => {
    const [last, dismissed, itemCount] = await Promise.all([
      db.settings.get(SETTING_KEYS.lastBackupAt),
      db.settings.get(SETTING_KEYS.reminderDismissedAt),
      db.items.count(),
    ])
    return {
      lastBackupAt: last?.value as string | undefined,
      dismissedAt: dismissed?.value as string | undefined,
      itemCount,
    }
  }, [])

  if (!state) return null
  const now = new Date()
  if (!shouldShowBackupReminder({ ...state, now })) return null

  const days = daysSince(state.lastBackupAt, now)
  const message =
    days === undefined
      ? 'Your library lives only on this phone. Save a backup.'
      : `It has been ${days} days since your last backup.`

  const doExport = async () => {
    try {
      const { fileName } = await exportNow()
      toast.show(`Backup saved: ${fileName}`)
    } catch (e) {
      toast.show(`Couldn't export: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }

  return (
    <div className="mx-4 mb-3 flex items-center gap-2 rounded-2xl bg-accent-soft p-3 text-accent-soft-ink" role="note">
      <p className="min-w-0 flex-1 text-xs leading-snug">{message}</p>
      <button
        type="button"
        onClick={doExport}
        className="min-h-11 shrink-0 rounded-xl bg-accent px-3 text-sm font-semibold text-on-accent active:opacity-70"
      >
        Export now
      </button>
      <button
        type="button"
        aria-label="Dismiss backup reminder"
        onClick={() => void setSetting(SETTING_KEYS.reminderDismissedAt, new Date().toISOString())}
        className="flex h-11 w-9 shrink-0 items-center justify-center rounded-xl text-lg active:bg-accent/10"
      >
        ×
      </button>
    </div>
  )
}
