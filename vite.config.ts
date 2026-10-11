/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { handleTmdb } from './api/tmdb.ts'

/**
 * Dev only: serve /api/tmdb from `npm run dev` using the same handler Vercel runs,
 * reading TMDB_API_KEY from the gitignored .env. (`vercel dev` works too.)
 */
function tmdbDevProxy(): Plugin {
  return {
    name: 'tmdb-dev-proxy',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')
      server.middlewares.use('/api/tmdb', async (incoming, outgoing) => {
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
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), tmdbDevProxy()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
  },
})
