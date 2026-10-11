import { describe, expect, it, vi } from 'vitest'
import { buildTmdbUrl, handleTmdb } from './tmdb'

const KEY = 'secret-key'

describe('buildTmdbUrl', () => {
  it('builds a search URL with the key, language and adult filter', () => {
    const r = buildTmdbUrl({ path: 'search/multi', query: 'dune' }, KEY)
    expect('url' in r).toBe(true)
    const url = new URL((r as { url: string }).url)
    expect(url.origin + url.pathname).toBe('https://api.themoviedb.org/3/search/multi')
    expect(url.searchParams.get('query')).toBe('dune')
    expect(url.searchParams.get('api_key')).toBe(KEY)
    expect(url.searchParams.get('include_adult')).toBe('false')
    expect(url.searchParams.get('language')).toBe('en-US')
  })

  it('allows detail endpoints', () => {
    expect('url' in buildTmdbUrl({ path: 'movie/438631' }, KEY)).toBe(true)
    expect('url' in buildTmdbUrl({ path: '/tv/95396' }, KEY)).toBe(true)
  })

  it('rejects anything else', () => {
    for (const path of [
      'account',
      'movie/123/credits',
      'movie/abc',
      'search/person',
      '../3/account',
      'search/multi/../../account',
      '',
      undefined,
    ]) {
      expect('message' in buildTmdbUrl({ path, query: 'x' }, KEY)).toBe(true)
    }
  })

  it('requires a non-blank query for searches and bounds its length', () => {
    expect('message' in buildTmdbUrl({ path: 'search/tv', query: '   ' }, KEY)).toBe(true)
    expect('message' in buildTmdbUrl({ path: 'search/tv' }, KEY)).toBe(true)
    expect('message' in buildTmdbUrl({ path: 'search/tv', query: 'a'.repeat(201) }, KEY)).toBe(true)
  })

  it('does not let callers override the key or adult filter', () => {
    const r = buildTmdbUrl({ path: 'search/tv', query: 'x', api_key: 'evil', include_adult: 'true' }, KEY)
    const url = new URL((r as { url: string }).url)
    expect(url.searchParams.get('api_key')).toBe(KEY)
    expect(url.searchParams.get('include_adult')).toBe('false')
  })
})

describe('handleTmdb', () => {
  it('fails clearly when the key is missing', async () => {
    const r = await handleTmdb({ path: 'search/tv', query: 'x' }, undefined, vi.fn())
    expect(r.status).toBe(500)
  })

  it('returns upstream JSON on success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [1] }), { status: 200 }))
    const r = await handleTmdb({ path: 'search/tv', query: 'x' }, KEY, fetchImpl)
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ results: [1] })
  })

  it('never leaks the key in error bodies', async () => {
    const down = vi.fn().mockRejectedValue(new Error(`boom https://x?api_key=${KEY}`))
    const bad = vi.fn().mockResolvedValue(new Response('nope', { status: 401 }))
    for (const fetchImpl of [down, bad]) {
      const r = await handleTmdb({ path: 'search/tv', query: 'x' }, KEY, fetchImpl)
      expect(r.status).toBe(502)
      expect(JSON.stringify(r)).not.toContain(KEY)
    }
  })

  it('does not call upstream for invalid requests', async () => {
    const fetchImpl = vi.fn()
    const r = await handleTmdb({ path: 'account' }, KEY, fetchImpl)
    expect(r.status).toBe(400)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
