import { useLiveQuery } from 'dexie-react-hooks'
import { useToast } from '../../components/Toast'
import { db } from '../../data/db'
import { setSetting, SETTING_KEYS } from '../../data/settings'
import { backupReminder, countUnsavedChanges, daysSince } from '../../domain/backup'
import { backUpNow, describeBackUp } from './exportAction'

/**
 * Quiet, dismissible reminder on Home. It appears when 5 or more additions or edits are not
 * in any backup yet, when the last backup is over 30 days old, or when there has never been
 * one and the library has 10+ items. One tap sends a backup off the phone (share sheet).
 */
export function BackupBanner() {
  const toast = useToast()
  const state = useLiveQuery(async () => {
    const [last, dismissed, items, logs, quotes] = await Promise.all([
      db.settings.get(SETTING_KEYS.lastBackupAt),
      db.settings.get(SETTING_KEYS.reminderDismissedAt),
      db.items.toArray(),
      db.logs.toArray(),
      db.quotes.toArray(),
    ])
    const lastBackupAt = last?.value as string | undefined
    return {
      lastBackupAt,
      dismissedAt: dismissed?.value as string | undefined,
      itemCount: items.length,
      unsavedChanges: countUnsavedChanges({ items, logs, quotes }, lastBackupAt),
    }
  }, [])

  if (!state) return null
  const now = new Date()
  const { show, reason } = backupReminder({ ...state, now })
  if (!show) return null

  const days = daysSince(state.lastBackupAt, now)
  const changes = state.unsavedChanges
  const message =
    reason === 'changes'
      ? `${changes} ${changes === 1 ? 'change isn' : 'changes aren'}'t backed up yet. Your data lives only on this phone.`
      : days === undefined
        ? 'Your library lives only on this phone. Save a backup.'
        : `It has been ${days} days since your last backup.`

  const doBackUp = async () => {
    try {
      toast.show(describeBackUp(await backUpNow()))
    } catch (e) {
      toast.show(`Couldn't back up: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }

  return (
    <div className="mx-4 mb-3 flex items-center gap-2 rounded-2xl bg-accent-soft p-3 text-accent-soft-ink" role="note">
      <p className="min-w-0 flex-1 text-xs leading-snug">{message}</p>
      <button
        type="button"
        onClick={doBackUp}
        className="min-h-11 shrink-0 rounded-xl bg-accent px-3 text-sm font-semibold text-on-accent active:opacity-70"
      >
        Back up now
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
