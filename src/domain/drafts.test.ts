import { describe, expect, it } from 'vitest'
import { confirmDraft, matchDraft, searchTermFor } from './drafts'
import { createItem } from './items'

const t0 = new Date(2026, 9, 1)
const t1 = new Date(2026, 9, 5)

const draft = () =>
  createItem({ type: 'book', title: 'dune', isDraft: true, recommendedBy: 'Sam', tags: ['scifi'] }, t0, 'i1')

describe('matchDraft', () => {
  it('takes metadata from the match and keeps the user-owned fields', () => {
    const d = { ...draft(), status: 'in_progress' as const }
    const m = matchDraft(
      d,
      { type: 'movie', title: 'Dune', creator: 'Denis V.', year: 2021, coverUrl: 'c', externalId: 'movie:1' },
      t1,
    )
    expect(m).toMatchObject({
      id: 'i1',
      type: 'movie',
      title: 'Dune',
      creator: 'Denis V.',
      year: 2021,
      coverUrl: 'c',
      externalId: 'movie:1',
      isDraft: false,
      status: 'in_progress',
      recommendedBy: 'Sam',
      tags: ['scifi'],
      createdAt: d.createdAt,
      updatedAt: t1.toISOString(),
    })
  })
  it('does not mutate the draft and drops stale metadata the match lacks', () => {
    const d = { ...draft(), creator: 'Old', year: 1999 }
    const m = matchDraft(d, { type: 'book', title: 'Dune' }, t1)
    expect(d.creator).toBe('Old')
    expect('creator' in m).toBe(false)
    expect('year' in m).toBe(false)
  })
  it('takes genres from the match, but never overwrites genres the user chose', () => {
    const m = { type: 'book' as const, title: 'Dune', genres: ['science fiction', 'Fantasy'] }
    expect(matchDraft(draft(), m, t1).genres).toEqual(['Science Fiction', 'Fantasy'])
    expect(matchDraft({ ...draft(), genres: ['Cozy Mystery'] }, m, t1).genres).toEqual(['Cozy Mystery'])
    expect('genres' in matchDraft(draft(), { type: 'book', title: 'Dune' }, t1)).toBe(false)
  })
  it('keeps a scanned ISBN over the one from the match', () => {
    const d = { ...draft(), isbn: '111' }
    expect(matchDraft(d, { type: 'book', title: 'Dune', isbn: '222' }, t1).isbn).toBe('111')
    expect(matchDraft(draft(), { type: 'book', title: 'Dune', isbn: '222' }, t1).isbn).toBe('222')
  })
})

describe('confirmDraft', () => {
  it('clears the flag and changes nothing else', () => {
    const c = confirmDraft(draft(), t1)
    expect(c.isDraft).toBe(false)
    expect(c.title).toBe('dune')
    expect(c.updatedAt).toBe(t1.toISOString())
  })
})

describe('searchTermFor', () => {
  it('uses the title normally and the ISBN for placeholder scan drafts', () => {
    expect(searchTermFor(draft())).toBe('dune')
    expect(searchTermFor({ ...draft(), title: 'ISBN 9780441172719', isbn: '9780441172719' })).toBe('9780441172719')
  })
})
