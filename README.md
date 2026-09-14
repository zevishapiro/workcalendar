# Hours

A one-field work hours tracker. Tap a day, type `7.5` or `9-5` or `9-1, 2-6`,
and it does the rest: monthly totals, earnings at your hourly rate, averages,
a chart. No login, no server, no build step. Data lives in the browser of the
device you use it on.

## Files

| File | What it is |
|---|---|
| `index.html` | The whole app: markup, styles, and the UI code |
| `parser.js` | `parseEntry(text)`, the one function that reads what you typed |
| `stats.js` | Dates, rate history, rounding, periods, aggregates |
| `parser.test.js`, `stats.test.js` | Tests. Run with `node parser.test.js && node stats.test.js` |
| `sw.js` | Service worker so the app opens offline |
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

## What you can type

Durations: `8`, `7.5`, `7,5`, `7:30`, `7h30`, `7h 30m`, `45m`, `0.75`

Time ranges: `9-5`, `9 to 5`, `9:30-17:15`, `9am-5pm`, `9.30-5`, `930-515`,
`21-2` (crosses midnight)

Breaks: list the ranges and they're added up: `9-1, 2-6`

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
