import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../../data/db'
import { shouldShowLoss } from '../../domain/health'
import { useHealth } from '../../hooks/useHealth'
import { dismissLossAlert } from '../../services/healthMonitor'

/**
 * Shown on Home when the library opens empty although it had items the last time it was used.
 * Quiet in size but impossible to miss: it names what was lost and offers the two useful next steps.
 */
export function LossAlert() {
  const health = useHealth()
  const count = useLiveQuery(() => db.items.count(), [])
  if (!shouldShowLoss(health, count) || !health.loss) return null

  const { previousItems, previousAt } = health.loss
  return (
    <div role="alert" className="mx-4 mb-3 rounded-2xl bg-warn-soft p-3 text-warn-ink ring-2 ring-danger">
      <p className="text-sm font-semibold">Your library is empty</p>
      <p className="mt-1 text-xs leading-snug">
        It had {previousItems} {previousItems === 1 ? 'item' : 'items'} when you last used Shelf (
        {new Date(previousAt).toLocaleDateString()}). That shouldn&rsquo;t happen on its own. Don&rsquo;t clear anything:
        open the Storage check, or restore your latest backup.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Link
          to="/diagnostics"
          className="flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent active:opacity-70"
        >
          Storage check
        </Link>
        <Link to="/backup" className="flex min-h-11 items-center rounded-xl px-4 text-sm font-medium ring-1 ring-line active:bg-card">
          Restore a backup
        </Link>
        <button
          type="button"
          onClick={dismissLossAlert}
          className="min-h-11 rounded-xl px-3 text-sm text-muted active:bg-card"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
