/**
 * Vercel serverless function: a narrow proxy to TMDB so the API key stays on the server.
 *
 *   GET /api/tmdb?path=search/multi&query=dune
 *
 * Only search and detail endpoints are forwarded, with a fixed set of parameters.
 * The key is read from the TMDB_API_KEY environment variable and never sent to the client.
 * Kept in one file (no relative imports) so it deploys without extra configuration.
 */

const TMDB_BASE = 'https://api.themoviedb.org/3/'

const ALLOWED_PATHS: RegExp[] = [/^search\/(multi|movie|tv)$/, /^(movie|tv)\/\d{1,10}$/]
const FORWARDED_PARAMS = ['query', 'page', 'language', 'year'] as const
const MAX_QUERY_LENGTH = 200

type Query = Record<string, string | string[] | undefined>

export interface ProxyResult {
  status: number
  headers: Record<string, string>
  body: unknown
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

const fail = (status: number, message: string): ProxyResult => ({
  status,
  headers: { 'Cache-Control': 'no-store' },
  body: { error: message },
})

/** Validate the incoming query and build the upstream TMDB URL. Pure; exported for tests. */
export function buildTmdbUrl(query: Query, apiKey: string): { url: string } | { status: number; message: string } {
  const path = (first(query.path) ?? '').replace(/^\/+/, '')
  if (!ALLOWED_PATHS.some((re) => re.test(path))) {
    return { status: 400, message: 'Unsupported path' }
  }

  const url = new URL(path, TMDB_BASE)
  for (const name of FORWARDED_PARAMS) {
    const value = first(query[name])
    if (value === undefined) continue
    if (value.length > MAX_QUERY_LENGTH) return { status: 400, message: `Parameter too long: ${name}` }
    url.searchParams.set(name, value)
  }
  if (path.startsWith('search/') && !url.searchParams.get('query')?.trim()) {
    return { status: 400, message: 'Missing query' }
  }
  if (!url.searchParams.has('language')) url.searchParams.set('language', 'en-US')
  url.searchParams.set('include_adult', 'false')
  url.searchParams.set('api_key', apiKey)
  return { url: url.toString() }
}

export async function handleTmdb(
  query: Query,
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<ProxyResult> {
  if (!apiKey) return fail(500, 'TMDB_API_KEY is not configured')

  const built = buildTmdbUrl(query, apiKey)
  if ('message' in built) return fail(built.status, built.message)

  try {
    const upstream = await fetchImpl(built.url, { headers: { Accept: 'application/json' } })
    if (!upstream.ok) return fail(upstream.status === 404 ? 404 : 502, `TMDB responded ${upstream.status}`)
    return {
      status: 200,
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
      body: await upstream.json(),
    }
  } catch {
    return fail(502, 'Could not reach TMDB')
  }
}

// Minimal shapes of Vercel's Node request/response, so no @vercel/node dependency is needed.
interface VercelRequest {
  method?: string
  query: Query
}
interface VercelResponse {
  status(code: number): VercelResponse
  setHeader(name: string, value: string): unknown
  json(body: unknown): unknown
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const result = await handleTmdb(req.query, process.env.TMDB_API_KEY)
  for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value)
  res.status(result.status).json(result.body)
}
