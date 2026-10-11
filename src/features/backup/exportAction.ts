import { downloadTextFile } from '../../data/download'
import { exportBackup, markBackedUp } from '../../data/backupIo'

/** Export everything to a JSON download and record the time (this resets the backup reminder). */
export async function exportNow(): Promise<{ fileName: string; itemCount: number }> {
  const { text, fileName, itemCount } = await exportBackup()
  downloadTextFile(text, fileName)
  await markBackedUp()
  return { fileName, itemCount }
}
