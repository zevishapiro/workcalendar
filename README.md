# Hours

A one-field work hours tracker. Tap a day, type `7.5` or `9-5` or `9-1, 2-6`,
and it does the rest: monthly totals, earnings at your hourly rate, averages,
a chart. No login, no server, no build step. Data lives in the browser of the
device you use it on, and can back itself up to a Google Sheet.

## Files

| File | What it is |
|---|---|
| `index.html` | The whole app: markup, styles, and the UI code |
| `parser.js` | `parseEntry(text)`, the one function that reads what you typed |
| `stats.js` | Dates, rate history, rounding, periods, aggregates |
| `parser.test.js`, `stats.test.js` | Tests. Run with `node parser.test.js && node stats.test.js` |
| `sw.js` | Service worker so the app opens offline |
| `google-sheet-backup.gs` | The script that receives backups in a Google Sheet |
| `manifest.webmanifest`, `icons/` | Home-screen install |
| `netlify.toml` | Publish settings and cache headers |

## Run it locally

Any static file server works:

```
npx serve .
```

Then open the address it prints. Opening `index.html` straight from disk also
works, but the service worker and home-screen install need a real URL.

Add `?demo=1` to the URL (or use Settings, then "Load demo data") to see three
months of sample data. Demo data lives under its own storage key, so your real
entries are untouched.

## Deploy to Netlify

Either:

- **Netlify Drop:** go to https://app.netlify.com/drop and drag this folder onto
  the page. You get a URL in seconds.
- **Netlify CLI:** `npm i -g netlify-cli`, then `netlify deploy --prod --dir .`

Every time you deploy a change, bump `CACHE` in `sw.js` (`hours-v1` to
`hours-v2`, and so on). Phones that installed the app pick up the new files on
their next open. Without the bump they keep serving the old cached copy.

## Install on a phone

- **iPhone:** open the URL in Safari, tap Share, then "Add to Home Screen".
- **Android:** open the URL in Chrome, tap the menu, then "Install app" or
  "Add to Home screen".

Opening it from the home screen gives you a full-screen app that works offline.

## Start and End

The Calendar tab has a "Start work" button. Press it when you begin; press End
when you stop and the session lands in that day's field as a time range, like
`9:05-17:32`. Do it twice in a day and you get `9:05-12:30, 13:15-17:32`. The
start time is saved on the device, so closing the app or locking the phone
doesn't lose it. Tap the "Started 9:05" text to fix the start time if you
pressed the button late. Discard throws the session away.

## Send hours

The Stats tab has a "Send hours" card for telling whoever pays you what you
worked. Pick a range with This week, Last week, This month or Last month, or
set From and To yourself. It shows the date range, total hours, your rate and
the amount, with no day-by-day detail:

```
Hours for Sep 6 – 10, 2026
36 hours at $50/hour = $1,800
```

If your rate changed inside the range, each rate gets its own line plus a
total. Share opens the phone's share sheet so you can text it. Copy text puts
it on the clipboard. Spreadsheet gives a CSV with From, To, Hours, Rate and
Amount columns.

"Last invoiced" at the top of the card is the date you last invoiced. You
invoice however you like and just set the date here. Hours after it count as
not yet invoiced, and the card opens on that range ("Since last invoice").
Setting a later date keeps the old one under "Earlier", so you can see past
invoice dates. Setting an earlier date corrects the current one. If the dates
you pick include days on or before your last invoice, a warning says so, and
"Skip invoiced days" moves the start past them.

The + next to Spreadsheet adds a misc expense: type the amount and what it's for, then
press Add.
Expenses are added to the total (and to the text
and spreadsheet) until you change "Last invoiced". Then they count as billed
and go away. Each one gets its own line in the table; the x on it removes it.

## What you can type

Durations: `8`, `7.5`, `7,5`, `7:30`, `7h30`, `7h 30m`, `45m`, `0.75`

Time ranges: `9-5`, `9 to 5`, `9:30-17:15`, `9am-5pm`, `9.30-5`, `930-515`,
`21-2` (crosses midnight)

Breaks: list the ranges and they're added up: `9-1, 2-6`. A list can mix
ranges and plain hours: `4, 13:15-17:32`

Notes: anything after `#` is a note: `9-5 # client call`

A `0` marks a day off. Clearing the field removes the day.

## Backups

The data is only in the browser on that device. Settings has Export JSON,
which downloads a full backup, and Import JSON to restore it (merge or
replace). Export CSV gives a spreadsheet-friendly file with date, entry,
hours, earnings, and note. Do an export now and then; Settings shows when you
last did.

## Rate changes

Settings keeps a list of rates, each with the date it starts. Add a row when
you get a raise. Days before that date keep the old rate, so past months don't
change.

## Google Sheet backup

The browser is the only place the hours live, and clearing the browser's site
data erases them. Settings has a "Google Sheet backup" box: give it the address
of a Google Apps Script web app and every change is also sent to a Sheet.

Set it up once:

1. Make a Google Sheet. Open Extensions, then Apps Script.
2. Replace what's there with `google-sheet-backup.gs` and save.
3. Deploy, New deployment, type Web app. Execute as: Me. Who has access: Anyone.
   Approve the permission prompt. The script can only touch that one Sheet.
4. Copy the web app URL (it ends in `/exec`) into Settings in Hours.

The Sheet gets two tabs. `Days` is one row per day and is rewritten on every
backup. `Restore` keeps the whole backup as text, one row per calendar date,
newest on top, for the last 90 dates. To restore, copy the newest row's backup
text into a file ending `.json` and use Import JSON.

The address works like a password for adding to the Sheet: it can't be used to
read it. It is stored on the device next to the hours, apart from them, and is
never in an export. An app with no days sends nothing, so a wiped browser can't
blank the Sheet. After a wipe, paste the address in again.
