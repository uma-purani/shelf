# Project Brief: Shelf

## 1. What we're building

**Shelf** is a private, single-user app for tracking the books, movies, and TV shows I've finished, am in the middle of, and want to get to. It is a personal tool, not a product. There is one user (me), no accounts, no sharing, and no social features of any kind.

**Why it exists:** existing apps (Goodreads, Letterboxd) are full of noise: other people's reviews, feeds, and comments. I want a quiet place to track my own progress, and I want logging to be fast enough that it becomes a habit.

**The guiding principle: logging must take about two seconds.** Every design decision should be judged against this. If a feature adds a tap, a screen, or a required field to the logging flow, it needs a very good reason. The only required inputs are the ones listed in this brief; everything else must be skippable without friction.

I log almost entirely from my **Android phone** (Chrome). That is the primary target for design and testing.

## 2. Non-goals (do not build these)

- No user accounts, login, or multi-user support
- No social features: no friends, followers, feeds, likes, public profiles, or sharing
- No other users' reviews, ratings, or comments anywhere in the app
- No recommendations engine
- No importing from Goodreads, Letterboxd, or other services. I'm starting fresh.
- No cover image recognition or any feature that needs a paid or AI API key
- No database server and no cross-device sync (one small serverless proxy is allowed, see section 7)
- Do not overbuild. Prefer fewer, well-connected pieces over extra screens and settings.

## 3. Core concepts

**Item**: a single book, movie, or show.

**Status**: every item is in exactly one state:
- `want`: on my list, not started
- `in_progress`: currently reading or watching
- `finished`: completed
- `dropped`: started and abandoned

**Log entry**: a record of one time I consumed an item (start date, finish date, rating, notes). Kept separate from the item so I can re-read a book or rewatch a show without losing the history of the first time.

**Quote**: a passage or line I saved from an item. An item can have many quotes.

**Recommendation source**: who or what recommended the item to me (a person's name, a podcast, an article). Free text.

**Draft item**: an item saved through quick capture that hasn't been matched to full metadata yet. Drafts are real items (they appear in my lists and count normally) but are flagged so I can fill in details later.

## 4. Data model (starting point, adjust if there's a good reason)

```
Item
  id              string (uuid)
  type            "book" | "movie" | "show"
  title           string
  creator         string?       // author, director, or showrunner/network
  year            number?
  isbn            string?       // books only
  coverUrl        string?
  externalId      string?       // Open Library or TMDB id
  status          "want" | "in_progress" | "finished" | "dropped"
  isDraft         boolean       // true until matched to metadata or confirmed manually
  recommendedBy   string?       // free text, autocompletes from past values
  tags            string[]
  createdAt       datetime
  updatedAt       datetime

LogEntry
  id              string (uuid)
  itemId          string -> Item.id
  startedAt       date?         // set automatically when status becomes in_progress
  finishedAt      date?         // set automatically when status becomes finished
  rating          number?       // 0.5 to 5 in 0.5 steps; REQUIRED when status is finished
  progress        string?       // e.g. "p. 142", "S2E4"
  notes           string?
  createdAt       datetime

Quote
  id              string (uuid)
  itemId          string -> Item.id
  text            string
  location        string?       // page number, chapter, episode, or timestamp
  createdAt       datetime

Settings
  lastBackupAt    datetime?
```

The item's `status` reflects its most recent log entry. Rating and notes live on the log entry, not the item. Dates are set automatically by status changes so I never have to type them; they can be edited afterward.

## 5. MVP features

### 5.1 Status updates (the core loop)

1. **Start in one tap.** Want-list items show a one-tap "Start" action. This sets status to `in_progress` and stamps `startedAt`.
2. **Finish in two taps, with a required rating.** In-progress items show a "Finished" action. Tapping it reveals a row of five stars inline (no new screen). Tapping the left half of a star gives a half rating, the right half gives a full one (e.g. left half of the fourth star = 3.5). Tapping a star saves the rating, sets status to `finished`, and stamps `finishedAt` in one motion. Star touch targets must be large enough that half-star taps are accurate on a phone. An optional note field appears afterward and can be ignored. An item cannot be marked finished without a rating.
3. **Drop** is available from the item's menu and does not require a rating.
4. **Undo instead of confirm.** Routine actions show an "Undo" toast for a few seconds. No "Are you sure?" dialogs.

### 5.2 Adding items (three ways)

1. **Search add.** A persistent "Add" button opens a search field with the keyboard already up. Typing searches Open Library (books) and TMDB (movies/shows) with results as I type. Tapping a result adds it as `want` by default. Recommendation source is an optional field on this screen, autocompleting from names I've used before.
2. **Quick capture.** For when I hear about something and have no time: type a title, tap a type chip (book / movie / show), save. It is added to the want list as a draft. No search, no network required.
3. **ISBN barcode scan (books).** From the Add screen, open the camera and point it at the ISBN barcode on the back of a book, or pick a photo of a barcode from my gallery. Use the browser's built-in `BarcodeDetector` API (supported in Chrome on Android), then look up the ISBN via Open Library and add the book to my want list. Show the result with an Undo toast rather than a confirm step. If the ISBN isn't found, save a draft with the ISBN so I can fill in the title later. If I'm offline, queue the scanned ISBN and look it up when I'm back online.

### 5.3 Drafts inbox

A small "Needs details" section lists draft items. Tapping one runs a metadata search prefilled with its title (or ISBN) so I can match it in one tap, or confirm it as-is. The home screen shows a quiet badge with the draft count, never a blocking prompt.

### 5.4 Everything else

1. **Home screen.** "In progress" is first and most prominent. "Want" and "Finished" follow as tabs or sections. A small counter (e.g. "4 finished this month") sits on the home screen as a light motivator.
2. **Stats.** How many books, movies, and shows I finished this month and this year, plus totals and average rating.
3. **Quotes.** From an item's detail view, add a quote with optional location. A "Quotes" view lists all saved quotes across items, searchable.
4. **Item detail view.** Cover, metadata, recommendation source, full log history, quotes, edit and delete.
5. **Filter, sort, and search** my own library by type, status, tag, rating, recommendation source, and date finished.
6. **Backup.** Export all data to a JSON file and import it back. Required because all data lives on the phone.
7. **Backup reminder.** If it has been more than 30 days since the last export (or I've never exported and have at least 10 items), show a dismissible banner on the home screen with a one-tap export. Track `lastBackupAt` in settings.

## 6. Nice-to-haves (after MVP, in rough order)

- Batch barcode scanning: select several barcode photos from my gallery at once (e.g. taken at a bookstore) and add them all as want-list items
- Android share target: share a barcode photo from my gallery directly into Shelf (Web Share Target API)
- Progress tracking for in-progress items (page or episode) with a one-tap increment
- Stats broken down by recommendation source (e.g. whose recommendations I finish and rate highly)
- Monthly and yearly history charts

## 7. Technical direction

- **Platform**: a mobile-first web app installed to my Android home screen as a PWA, so it opens like a native app. It should still work in a laptop browser, but Android Chrome is the priority.
- **Hosting**: Vercel, deployed from a GitHub repo. I will create the GitHub repo, push the code, and set up and connect the Vercel project myself. The app should build as a static Vite site that deploys to Vercel with no extra configuration beyond environment variables.
- **Storage**: local-first, in the browser via IndexedDB (Dexie.js is a good fit). Call `navigator.storage.persist()` on first launch so the browser is less likely to clear data.
- **Frontend**: React + TypeScript + Vite. Keep styling simple (Tailwind or plain CSS modules).
- **Metadata APIs**:
  - Books: Open Library Search API and ISBN lookup (free, no key), called directly from the client
  - Movies and shows: TMDB API (free key)
  - Debounce search requests and cache results.
- **TMDB key handling**: anything in a frontend bundle is public, so do not put the TMDB key in client code or a `VITE_` env variable. Instead, add one small Vercel serverless function (e.g. `/api/tmdb`) that forwards search and detail requests to TMDB, reading the key from a Vercel environment variable. This is the only server-side code in the project. For local development, document how to run it with `vercel dev` and a local `.env` file that is gitignored.
- **Barcode scanning**: native `BarcodeDetector` API. Only add a library fallback if it turns out to be unavailable on my device, and ask first.
- **Offline**: the app opens and works offline, including status updates, ratings, notes, quotes, and quick capture. Metadata search needs a connection; scanned ISBNs queue until online.
- **PWA shortcuts**: add home-screen shortcuts for "Quick capture" and "Scan a book" via the web app manifest.

If any of these choices seem wrong for the goals above, explain the tradeoff and recommend an alternative before building.

## 8. Design notes

- Designed for one-handed phone use. Primary actions sit within thumb reach at the bottom of the screen.
- Covers are the main visual element. Grid of covers for browsing, list view as an option. Drafts without a cover get a simple generated placeholder with the title.
- Quiet, uncluttered look. Supports light and dark mode.
- No confirmation dialogs for routine actions; use Undo toasts.
- Required fields: title and type when adding, and a rating when finishing. Nothing else is ever required.

## 9. Definition of done for the MVP

- I can start a want-list item in one tap, and finish an in-progress item in two taps (Finished, then a star)
- Half-star ratings work reliably by touch, and display correctly everywhere ratings appear
- The app does not allow an item to be marked finished without a rating
- Quick capture saves a draft with just a title and type, offline
- Scanning a book's ISBN barcode (live camera or gallery photo) adds the correct book to my want list
- Unknown or offline ISBN scans become drafts or queued lookups instead of failing
- Drafts appear in "Needs details" and can be matched to metadata in one tap
- I can add a book, movie, and show via search
- The TMDB key never appears in the client bundle or the repo
- Recommendation source autocompletes from past values
- I can save quotes to an item and browse all quotes in one place
- Stats show correct counts for this month and this year, by type
- I can re-read or rewatch something and see both log entries, and both count in stats
- Data survives closing the app and restarting the phone
- Export produces a JSON file, importing it into a fresh install restores everything, and the backup reminder appears after 30 days without an export
- The app deploys to Vercel, installs to my Android home screen, and opens offline
- Core logic (status transitions, required rating, half-star math, automatic dates, stats counting, draft handling, import/export) has unit tests

## 10. How to work with me

- Start by proposing a short plan and file structure. Wait for my approval before writing large amounts of code.
- Build in small, working increments, in this order: data layer → home screen with start/finish (including required half-star rating) → search add (with the TMDB proxy) → quick capture and drafts inbox → stats → quotes → export/import and backup reminder → ISBN barcode scanning → PWA/offline and shortcuts.
- Ask before adding any dependency beyond the stack listed above.
- **Git**: initialize a local git repo at the start, with a sensible `.gitignore` (including `.env` files). Make a local commit after each working increment with a clear message, so I can roll back if something breaks. Do not create a GitHub repo, add remotes, or push. I handle everything on GitHub myself.
- After each increment, tell me what changed and how to test it on my Android phone.
- Keep a short README with setup steps: getting a TMDB key, adding it as a Vercel environment variable, running locally with `vercel dev`, and installing Shelf to my home screen.
