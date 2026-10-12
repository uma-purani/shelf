/*
 * Web Share Target handler. The generated service worker loads this with importScripts.
 *
 * When you share photos to Shelf from another app (e.g. the gallery), Android sends them as a
 * multipart POST to /share-target. The page can't receive that directly, so the worker stashes
 * the photos in Cache Storage and redirects to the in-app share screen, which reads them back,
 * scans them and clears the cache.
 *
 * Keep SHARED_CACHE and the form field name ("photos") in sync with src/services/sharedPhotos.ts
 * and the manifest's share_target in vite.config.ts.
 */
const SHARE_PATH = '/share-target'
const SHARED_CACHE = 'shelf-shared-photos'

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'POST' || new URL(request.url).pathname !== SHARE_PATH) return

  event.respondWith(
    (async () => {
      try {
        const form = await request.formData()
        const photos = form.getAll('photos').filter((f) => f instanceof File && f.type.startsWith('image/'))
        const cache = await caches.open(SHARED_CACHE)
        for (const key of await cache.keys()) await cache.delete(key) // start clean
        await Promise.all(
          photos.map((photo, i) =>
            cache.put(`/shared-photos/${i}`, new Response(photo, { headers: { 'Content-Type': photo.type } })),
          ),
        )
      } catch {
        // fall through: the share screen reports "no photos received"
      }
      return Response.redirect('/#/share', 303)
    })(),
  )
})
