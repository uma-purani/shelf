# Shelf

A private, single-user tracker for books, movies and shows. Local-first (IndexedDB), built as a mobile-first PWA. See `media-tracker-brief.md` for the full spec.

## Develop

Requires Node 20+.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (vitest)
npm run build    # typecheck + production build (also generates the service worker)
npm run preview  # serve the production build locally on :4173
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

## Deploy to Vercel

Shelf builds as a static Vite site plus the one `/api/tmdb` function, so Vercel needs no config file.

1. Push the repo to GitHub (you do this yourself).
2. In Vercel: **Add New → Project**, import the repo. It detects Vite on its own (build `npm run build`, output `dist`); leave the defaults.
3. Before the first deploy, open **Environment Variables** and add `TMDB_API_KEY` (see above), then **Deploy**.
4. Your site is served over HTTPS, which is what the camera, the service worker and installing need.

Updates: every push to `main` redeploys. An installed Shelf picks up the new version in the background and switches to it the next time you open the app.

## Install Shelf on your Android home screen

1. Open your Vercel URL in **Chrome** on the phone and let it load once.
2. Chrome menu (⋮) → **Install app** (or **Add to Home screen**). Confirm.
3. Open Shelf from the new icon: it runs full screen like a native app.
4. **Long-press the icon** to get the shortcuts **Quick capture** and **Scan a book**.

Once it has loaded once, Shelf opens **offline**: the app itself is cached by a service worker, and everything stored on the phone works without a connection (browsing, Start / Finish with ratings, notes, quotes, quick capture, stats, backup). What needs a connection: searching Open Library / TMDB, looking up a scanned ISBN (offline scans are queued and added automatically when you're back online), and loading covers you haven't seen before. Covers you have seen stay available offline (the most recent ~300, stored at their real size of ~20 KB each).

The app also asks the browser to keep its data from being cleared (`navigator.storage.persist()`). The real safety net is still **Backup** above.

### Checking the offline behaviour locally

The service worker only exists in the production build:

```bash
npm run build
npm run preview      # http://localhost:4173 (also serves /api/tmdb from your .env)
```

Open it once, then stop the preview server (Ctrl+C) and reload the page: it should still open.

## Progress and stats

- **Progress:** in-progress items show a **Progress** line (tap to type, e.g. `S4E7` or `p. 142`) with one-tap buttons: shows get **+1 ep** and **Next season**, books get **+10 pp**. Free text like "halfway through" is never overwritten by a button; edit it by hand instead. Each tap has an Undo.
- **Caught up:** a show you're up to date on (waiting for the next season) can be marked **Caught up** from its menu. It stays in progress, unrated, in its own group.
- **Stats** (tap "N finished this month"): counts by type for this month, this year and all time, a 12-month chart, a by-year chart, average ratings, and **By recommendation**: for each person or source you set under "Recommended by", how many they recommended, how many you finished, and the average rating you gave. Sources match ignoring capitalization.
- **Log dates:** open an item and each run in its log has **Started** and **Finished** (or **Dropped**) date pickers. Dates must be real, not in the future, and the finish can't be before the start. You can clear a start date (you don't know when you began) but a finish date can only be changed, not removed. Stats follow the new dates.
- **Genres:** movies and shows get genres from TMDB when you add them, and books get them from Open Library's subject headings (mapped onto a short list like Science Fiction, Fantasy, Mystery). Book genres are best-effort because those headings are messy, so edit them on the item: genres are removable chips with an add box (several at once, separated by commas). **Stats → By genre** shows which genres you finish most and rate highest, with a filter for books, movies or shows. For items saved before genres existed, the card's **Look up genres** button fills them in. Items you typed in by hand have nothing to look up, so give those genres yourself.
- **Dropped** items live on their own screen (top right), not on the main one.

## Scanning book barcodes

From **+ Add**, tap **Scan a book's barcode**. Point the rear camera at the ISBN barcode on the back of a book, or pick a photo of one from your gallery. It uses the browser's built-in `BarcodeDetector`, so there is no library or API key.

- Found in Open Library: added to your **Queue** with an Undo toast, no confirmation step. Scanning keeps going, so you can do several books in a row.
- Not found: saved as a **draft** carrying the ISBN, so you can match it later from "Needs details".
- Offline: the ISBN is queued and looked up automatically when you're back online.
- Already on your shelf: nothing is added.
- You can also type an ISBN (10 or 13 digits, hyphens optional). The check digit must be valid, so a misread barcode is rejected.

**Batch photos:** "Pick photos of barcodes" accepts many photos at once (for example ones you took at a bookstore). They are read one at a time with a progress label, each book is added to the Queue, and one summary toast with a single Undo covers the whole batch. The same book in two photos is only added once.

**Share from your gallery (installed app only):** open a barcode photo (or select several) in Google Photos / your gallery, tap **Share**, and choose **Shelf**. Shelf opens, reads the photos and adds the books. This needs Shelf installed to the home screen; after installing (or after a Shelf update that adds it) Android may take a little while to register Shelf as a share target. If it doesn't appear in the share sheet, uninstall and reinstall Shelf once. (Your data is kept in the browser, so export a **Backup** first.)

**Requirements:** Chrome on Android, over **HTTPS** (the deployed Vercel site, or `localhost`). The camera and `BarcodeDetector` are not available on a plain `http://192.168...` dev address, and desktop Chrome on Windows/Linux doesn't ship `BarcodeDetector`. When scanning isn't available the screen says why and typing an ISBN still works.

## Backup and restore

All data lives in the browser on your phone, so back it up. Open **Backup** from the home screen:

- **Send backup to…** opens your phone's share sheet with one JSON file (`shelf-backup-YYYY-MM-DD.json`: every item, log entry, rating, note and quote). Pick Drive, email, or a chat with yourself, so the copy is stored **outside the phone**. That is the only kind of backup that survives the phone clearing Chrome's data. Chrome on Android only lets certain file types through the share sheet, so if it refuses the `.json` file Shelf sends the same backup as `shelf-backup-….json.txt`; restoring accepts either. If your browser can't share files at all, the button becomes **Export backup**, which downloads the file: then send or upload it yourself from the Files app. "Download a file instead" saves it to Downloads (copy it off the phone too). Cancelling the share sheet doesn't count as a backup.
- **Choose backup file** merges a backup into the current library. Records are matched by ID and the more recently edited version wins; records that exist only on one side are kept. **Importing never deletes anything**, so something you deleted after making the backup comes back if the file still has it. A file is fully validated first, so a bad or newer-version file changes nothing. An Undo toast reverses an import.
- To restore onto a **fresh install**, just import the file.
- A banner on the home screen reminds you to back up when **5 or more additions or edits aren't in any backup yet** (dismissing hides it for a day), when your last backup is more than 30 days old, or when you have 10+ items and have never backed up (those two hide for a week). One tap on **Back up now** opens the share sheet.
- If the library opens **empty although it had items last time**, Shelf shows a red alert on the home screen right away, with links to the Storage check and to restore a backup. The check also keeps a short history of launches and storage errors, which is the evidence for working out what happened.

## If your data seems to be gone: Storage check

Open **Backup → Storage check** (or go to `/#/diagnostics` on your site's address). It reads the browser's storage directly and says in plain words what is there: whether the Shelf database exists at this address, how many items it holds, whether the app can open it, how much space the database vs. cached files use, and whether the browser has promised to keep the data. If the data is stored but the app can't read it, **Save a rescue copy** writes a normal backup file straight from the raw database; you can restore it with **Backup → Choose backup file**.

Good to know:
- Data is stored **per web address** (including the port). A different address, such as `http://192.168...:5173` instead of your Vercel site, or a different Vercel URL, is a separate empty Shelf.
- The size Chrome shows for a site is mostly cached cover images (Chrome counts those at an inflated size), not your data. The database itself is a few hundred KB.
- Browsers can discard a site's data when a phone is very low on storage, and they only promise not to on installed or "persistent" sites. **Back up regularly.**

## Testing on a phone

`npm run dev -- --host` prints a LAN address you can open on a phone on the same Wi-Fi. That address is plain `http://`, so camera scanning, the service worker and "install to home screen" will not work there; those need the deployed (HTTPS) site. Everything else works. (Dev mode never registers the service worker, so you always see your latest code.)
