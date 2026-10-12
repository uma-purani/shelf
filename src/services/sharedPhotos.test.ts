import { describe, expect, it } from 'vitest'
import { SHARED_CACHE, takeSharedPhotos } from './sharedPhotos'

/** Just enough of Cache Storage for the code under test. */
function fakeCacheStorage(initial: Record<string, string> = {}): CacheStorage {
  const entries = new Map(Object.entries(initial))
  const cache = {
    keys: async () => [...entries.keys()].map((url) => ({ url: `https://shelf.test${url}` }) as Request),
    match: async (req: Request) => {
      const body = entries.get(new URL(req.url).pathname)
      return body === undefined ? undefined : new Response(body)
    },
    delete: async (req: Request) => entries.delete(new URL(req.url).pathname),
  }
  return {
    open: async (name: string) => {
      expect(name).toBe(SHARED_CACHE)
      return cache
    },
  } as unknown as CacheStorage
}

describe('takeSharedPhotos', () => {
  it('returns the stashed photos in share order and empties the cache', async () => {
    const storage = fakeCacheStorage({ '/shared-photos/10': 'k', '/shared-photos/2': 'c', '/shared-photos/0': 'a' })
    const photos = await takeSharedPhotos(storage)
    expect(await Promise.all(photos.map((p) => p.text()))).toEqual(['a', 'c', 'k']) // numeric, not alphabetical
    expect(await takeSharedPhotos(storage)).toEqual([]) // each share is processed once
  })

  it('returns nothing when nothing was shared or Cache Storage is unavailable', async () => {
    expect(await takeSharedPhotos(fakeCacheStorage())).toEqual([])
    expect(await takeSharedPhotos(undefined)).toEqual([])
  })
})
