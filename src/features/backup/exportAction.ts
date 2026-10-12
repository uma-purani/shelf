import { downloadTextFile } from '../../data/download'
import { exportBackup, markBackedUp } from '../../data/backupIo'

/** Export everything to a JSON download and record the time (this resets the backup reminder). */
export async function exportNow(): Promise<{ fileName: string; itemCount: number }> {
  const { text, fileName, itemCount } = await exportBackup()
  downloadTextFile(text, fileName)
  await markBackedUp()
  return { fileName, itemCount }
}

/** Can this browser hand a file to the phone's share sheet (Drive, email, Messages...)? */
export function canShareBackup(): boolean {
  try {
    const probe = new File(['{}'], 'shelf-backup.json', { type: 'application/json' })
    return typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [probe] })
  } catch {
    return false
  }
}

export type BackUpResult =
  | { method: 'shared' | 'downloaded'; fileName: string; itemCount: number }
  | { method: 'cancelled' }

/**
 * Back up in the way that actually gets the data off this phone: the share sheet when the
 * browser has one (send it to Drive, email, a chat with yourself...), otherwise a download.
 * The "last backup" time is only recorded when the file really went somewhere.
 */
export async function backUpNow(): Promise<BackUpResult> {
  const { text, fileName, itemCount } = await exportBackup()

  if (canShareBackup()) {
    try {
      const file = new File([text], fileName, { type: 'application/json' })
      await navigator.share({ files: [file], title: 'Shelf backup', text: `Shelf backup (${itemCount} items)` })
      await markBackedUp()
      return { method: 'shared', fileName, itemCount }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return { method: 'cancelled' } // closed the sheet
      // sharing failed for some other reason: fall back to a plain download below
    }
  }
  downloadTextFile(text, fileName)
  await markBackedUp()
  return { method: 'downloaded', fileName, itemCount }
}

export function describeBackUp(r: BackUpResult): string {
  if (r.method === 'cancelled') return 'Backup cancelled. Nothing was saved.'
  const items = `${r.itemCount} ${r.itemCount === 1 ? 'item' : 'items'}`
  return r.method === 'shared'
    ? `Backup sent (${items}). Keep that copy somewhere outside this phone.`
    : `Saved ${r.fileName} (${items}). Copy it off this phone too.`
}
