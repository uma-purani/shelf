/** Must match public/share-target-sw.js. */
export const SHARED_CACHE = 'shelf-shared-photos'

/**
 * Read the photos the service worker stashed after a Web Share (in the order they were shared)
 * and remove them from the cache, so each share is processed exactly once.
 */
export async function takeSharedPhotos(storage: CacheStorage | undefined = globalThis.caches): Promise<Blob[]> {
  if (!storage) return []
  const cache = await storage.open(SHARED_CACHE)
  const requests = [...(await cache.keys())].sort((a, b) => indexOf(a.url) - indexOf(b.url))

  const photos: Blob[] = []
  for (const request of requests) {
    const response = await cache.match(request)
    if (response) photos.push(await response.blob())
    await cache.delete(request)
  }
  return photos
}

const indexOf = (url: string) => Number(url.match(/(\d+)$/)?.[1] ?? 0)
