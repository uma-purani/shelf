/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { handleTmdb } from './api/tmdb.ts'

/**
 * Local only: serve /api/tmdb from `npm run dev` and `npm run preview` using the same handler
 * Vercel runs, reading TMDB_API_KEY from the gitignored .env. (`vercel dev` works too.)
 * Not part of the production build; on Vercel the real function in api/ answers.
 */
function tmdbLocalProxy(): Plugin {
  const middleware = (mode: string): Connect.NextHandleFunction => {
    const env = loadEnv(mode, process.cwd(), '')
    return async (incoming, outgoing) => {
      // Minimal shapes: avoids depending on @types/node for Node's http types
      const req = incoming as { url?: string }
      const res = outgoing as unknown as {
        statusCode: number
        setHeader(name: string, value: string): void
        end(body: string): void
      }
      const params = new URL(req.url ?? '', 'http://localhost').searchParams
      const result = await handleTmdb(Object.fromEntries(params), env.TMDB_API_KEY)
      res.statusCode = result.status
      res.setHeader('Content-Type', 'application/json')
      for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value)
      res.end(JSON.stringify(result.body))
    }
  }
  return {
    name: 'tmdb-local-proxy',
    configureServer: (server) => void server.middlewares.use('/api/tmdb', middleware(server.config.mode)),
    configurePreviewServer: (server) => void server.middlewares.use('/api/tmdb', middleware(server.config.mode)),
  }
}

const icon = (src: string, size: number, purpose?: string) => ({
  src,
  sizes: `${size}x${size}`,
  type: 'image/png',
  ...(purpose ? { purpose } : {}),
})

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    tmdbLocalProxy(),
    VitePWA({
      // New versions install in the background and take over on the next open.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Shelf',
        short_name: 'Shelf',
        description: 'A quiet, private tracker for the books, movies and shows you finish.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f7f5ef',
        theme_color: '#f7f5ef',
        icons: [icon('/icons/icon-192.png', 192, 'any'), icon('/icons/icon-512.png', 512, 'any'), icon('/icons/icon-maskable-512.png', 512, 'maskable')],
        // Share a barcode photo (or several) from the gallery straight into Shelf.
        // public/share-target-sw.js receives the POST; /#/share processes the photos.
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { files: [{ name: 'photos', accept: ['image/*'] }] },
        },
        shortcuts: [
          {
            name: 'Quick capture',
            short_name: 'Capture',
            description: 'Save a title to your Queue in a couple of seconds',
            url: '/#/capture',
            icons: [icon('/icons/icon-192.png', 192)],
          },
          {
            name: 'Scan a book',
            short_name: 'Scan',
            description: 'Scan an ISBN barcode to add a book',
            url: '/#/scan',
            icons: [icon('/icons/icon-192.png', 192)],
          },
        ],
      },
      workbox: {
        // The whole app shell is precached, so Shelf opens (and all local features work) offline.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        importScripts: ['share-target-sw.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Covers you've seen keep showing offline. Searches are never cached by the worker.
            urlPattern: ({ url }) => url.origin === 'https://covers.openlibrary.org' || url.origin === 'https://image.tmdb.org',
            handler: 'CacheFirst',
            options: {
              cacheName: 'cover-images',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] }, // 0 = opaque cross-origin <img> responses
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
  },
})
