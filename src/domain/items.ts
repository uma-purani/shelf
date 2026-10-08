import type { Item, ItemType } from './types'

export interface NewItemInput {
  type: ItemType
  title: string
  creator?: string
  year?: number
  isbn?: string
  coverUrl?: string
  externalId?: string
  recommendedBy?: string
  tags?: string[]
  isDraft?: boolean
}

/** Build a new item in the `want` state. Only type and title are required. */
export function createItem(input: NewItemInput, now: Date, id: string): Item {
  const title = input.title.trim()
  if (!title) throw new Error('Title is required')

  const iso = now.toISOString()
  const item: Item = {
    id,
    type: input.type,
    title,
    status: 'want',
    isDraft: input.isDraft ?? false,
    tags: input.tags ?? [],
    createdAt: iso,
    updatedAt: iso,
  }
  const optional = ['creator', 'year', 'isbn', 'coverUrl', 'externalId', 'recommendedBy'] as const
  for (const key of optional) {
    const value = input[key]
    if (value !== undefined && value !== '') (item as unknown as Record<string, unknown>)[key] = value
  }
  return item
}
