# Shelf

A private, single-user tracker for books, movies and shows. Local-first (IndexedDB), built as a mobile-first PWA. See `media-tracker-brief.md` for the full spec.

## Develop

Requires Node 20+.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (vitest)
npm run build    # typecheck + production build
```

TMDB proxy, Vercel deployment and "install to home screen" steps are added in later increments.
