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

## TMDB key (movies and shows)

Book search uses Open Library and needs no key. Movie and show search uses [TMDB](https://www.themoviedb.org/), through one small serverless function (`api/tmdb.ts`) so the key never reaches the browser.

1. Create a free TMDB account, then go to **Settings → API** and request a key. You want the **API Key** (a 32-character hex string, "v3 auth"), not the long "Read Access Token".
2. **Locally:** copy `.env.example` to `.env` and put your key in it:
   ```
   TMDB_API_KEY=your_key_here
   ```
   `.env` is gitignored. `npm run dev` serves `/api/tmdb` itself using this file (restart the dev server after editing `.env`). `vercel dev` works too and reads the same file.
3. **On Vercel:** open your project → **Settings → Environment Variables**, add `TMDB_API_KEY` with your key (all environments), then redeploy.

The proxy only forwards TMDB search and detail requests, with a fixed set of parameters, so it can't be used as a general TMDB relay.

Vercel deployment and "install to home screen" steps are added in later increments.

## Testing on a phone

`npm run dev -- --host` prints a LAN address you can open on a phone on the same Wi-Fi. That address is plain `http://`, so camera scanning, service workers and "install to home screen" will not work there; those need the deployed (HTTPS) site. Everything else works.
