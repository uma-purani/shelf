import { db as defaultDb, type ShelfDB } from './db'

export const SETTING_KEYS = {
  lastBackupAt: 'lastBackupAt',
  reminderDismissedAt: 'backupReminderDismissedAt',
} as const

export async function getSetting<T>(key: string, db: ShelfDB = defaultDb): Promise<T | undefined> {
  return (await db.settings.get(key))?.value as T | undefined
}

export async function setSetting(key: string, value: unknown, db: ShelfDB = defaultDb): Promise<void> {
  await db.settings.put({ key, value })
}
