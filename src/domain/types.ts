export type ItemType = 'book' | 'movie' | 'show'
export type Status = 'want' | 'in_progress' | 'finished' | 'dropped'

/** Calendar date, local time, "YYYY-MM-DD". */
export type DateString = string
/** ISO 8601 datetime. */
export type DateTimeString = string

export interface Item {
  id: string
  type: ItemType
  title: string
  creator?: string
  year?: number
  isbn?: string
  coverUrl?: string
  externalId?: string
  status: Status
  isDraft: boolean
  recommendedBy?: string
  tags: string[]
  createdAt: DateTimeString
  updatedAt: DateTimeString
}

export interface LogEntry {
  id: string
  itemId: string
  startedAt?: DateString
  finishedAt?: DateString
  droppedAt?: DateString
  /** 0.5 to 5 in 0.5 steps. Required when the entry is finished. */
  rating?: number
  progress?: string
  notes?: string
  createdAt: DateTimeString
}

export interface Quote {
  id: string
  itemId: string
  text: string
  location?: string
  createdAt: DateTimeString
}

export interface PendingLookup {
  id: string
  isbn: string
  createdAt: DateTimeString
}

export interface SettingRow {
  key: string
  value: unknown
}
