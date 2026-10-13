import { downloadTextFile } from '../../data/download'
import { exportBackup, markBackedUp } from '../../data/backupIo'

/** Export everything to a JSON download and record the time (this resets the backup reminder). */
export async function exportNow(): Promise<{ fileName: string; itemCount: number }> {
  const { text, fileName, itemCount } = await exportBackup()
  downloadTextFile(text, fileName)
  await markBackedUp()
  return { fileName, itemCount }
}

/**
 * The ways a backup can be handed to the share sheet, best first. Some browsers (Chrome on
 * Android among them) only let a short list of file types through the share sheet and leave
 * out JSON, so the same content is also offered as a plain-text file. Restoring accepts both.
 */
export function shareCandidates(text: string, fileName: string): File[] {
  return [
    new File([text], fileName, { type: 'application/json' }),
    new File([text], `${fileName}.txt`, { type: 'text/plain' }),
  ]
}

/** The first candidate file this browser's share sheet accepts, if any. */
function shareableFile(text: string, fileName: string): File | undefined {
  try {
    if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return undefined
    return shareCandidates(text, fileName).find((f) => navigator.canShare({ files: [f] }))
  } catch {
    return undefined
  }
}

/** Can this browser hand a backup file to the phone's share sheet (Drive, email, Messages...)? */
export function canShareBackup(): boolean {
  return shareableFile('{}', 'shelf-backup.json') !== undefined
}

/** For the Storage check: what the share sheet will take on this browser. */
export function shareSupportReport(): { api: boolean; json: boolean; text: boolean } {
  const can = (f: File) => {
    try {
      return typeof navigator.canShare === 'function' && !!navigator.canShare({ files: [f] })
    } catch {
      return false
    }
  }
  const [json, txt] = shareCandidates('{}', 'shelf-backup.json')
  return { api: typeof navigator.share === 'function', json: can(json), text: can(txt) }
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

  const file = shareableFile(text, fileName)
  if (file) {
    try {
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
