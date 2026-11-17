# EasyWalk Documentation — Web App

Invoices, treatment protocols, certificates, additional documents and IPD patient profiles for
EasyWalk Physiotherapy and Rehabilitation Centre.

Runs in any browser, installs to a phone home screen, and works with no internet connection once
loaded. All data stays on the device — nothing is uploaded anywhere.

> **Branches**
> - `master` — this web app.
> - `offline-app` — the Electron desktop build it was converted from. Kept because it still works;
>   it was replaced because Electron was too slow on the clinic PC's 4 GB of RAM.

## Running it locally

Needs [Node.js](https://nodejs.org) only for the dev server — the app itself has no build step and
no dependencies.

```
npm start
```

Then open http://127.0.0.1:8080/. (Opening `index.html` directly off the disk mostly works, but
offline mode is disabled there because service workers need `http://` or `https://`.)

## Putting it online (GitHub Pages)

The whole app is static files, so it can be served straight from this repository:

1. Push `master`.
2. On GitHub: **Settings → Pages → Source: Deploy from a branch → `master` / `(root)` → Save**.
3. After a minute it is live at `https://abhi-creator1.github.io/easywalk_invoice_app/`.

No build and no workflow file. Every path in the app is relative, so serving it from a subfolder
works as-is.

To publish an update, push to `master` and bump `CACHE_VERSION` at the top of [sw.js](sw.js) —
otherwise returning visitors keep the cached copy.

## Installing it on a phone or PC

Open the link in Chrome (Android/desktop) or Safari (iPhone):

- **Android / desktop Chrome** — the install icon appears in the address bar, or use
  **⋮ → Install app**. There is also an **Install app** button in the app's Settings tab.
- **iPhone / iPad** — **Share → Add to Home Screen**.

Installed, it opens full-screen with no browser chrome and works offline.

## Where the data lives

In the browser's own database (IndexedDB), on that device. This matters:

- The clinic PC and a phone each keep **their own separate records**. They do not sync.
- Clearing browsing data / site data for the site erases the records. Keep backups.
- To move data between devices, or before clearing anything: **Settings → Export Backup**, then
  **Import Backup** on the other device. The import asks for confirmation and refuses files that
  are not valid backups.

If the two devices ever need to share one live set of records, that needs a hosted backend
(Firebase or Supabase). The storage layer is already isolated behind
[js/platform/api.web.js](js/platform/api.web.js), so that can be added later without touching any
of the feature code.

## Generated PDFs

PDFs go to the browser's normal downloads folder. On a phone, use the share sheet from the download
notification to send one straight to WhatsApp or e-mail.

## Document numbering

| Document | Format | Example |
|---|---|---|
| Invoice | `EW_<Month><yy>_<nn>` | `EW_November26_03` |
| Treatment protocol | `TP_<Mon><yy>_<nn>` | `TP_Nov26_03` |
| Certificate | `CERT_<Mon><yy>_<nn>` | `CERT_Nov26_01` |

The sequence restarts each month. The invoice number shown in the form is a *suggestion* — it is
only used up when you actually save, so numbers stay gapless — and it can still be typed over by
hand. If a typed number is already in use, saving asks before replacing anything.

## Selecting treatment dates

One calendar handles every case:

- **Tap** a date to toggle it.
- **Drag** across dates to take a whole span.
- **Shift-tap** to extend from the last date you tapped.
- **Whole month** / **Weekdays** for the common cases.
- Drag back across selected dates to clear them.
- Or ignore the calendar and **type** the dates: `3/11/26, 7/11/26, 10/11/26 - 14/11/26`.

Separate days and spans can be mixed freely. Consecutive days are shown as one range, and a full
calendar month prints as "November 2026". **No. of Sessions** follows the number of dates picked
until you type your own value.

## Project layout

```
index.html              every view; forms plus the hidden A4 previews
css/app.css             all styling, including the print stylesheet
js/config/clinic.js     ← clinic name, address, PAN, phone. Edit here only.
js/core/util.js         escaping, money, dates, toasts, error wrapper
js/platform/            storage + the window.api contract (the only platform-specific code)
js/components/          the date picker
js/templates/           document letterheads
js/documents/           protocol, certificate, additional document
tools/                  dev server and the test harness
sw.js, manifest.json    offline support and home-screen install
```

[js/config/clinic.js](js/config/clinic.js) is the single source of truth for the clinic's details:
change the address there and it updates on invoices, protocols and certificates at once.

## Tests

```
npm test
```

Drives the real app in Chromium (via the bundled Electron) over the local server: the calendar's
tap/drag/shift-tap gestures, invoice numbering and totals, IPD billing links, HTML escaping,
page-break behaviour, backup validity and the mobile layout. It also renders each document through
`printToPDF` and **counts the pages**, which is what guards the trailing-blank-page fix.

Screenshots and the generated PDFs are written to `test-output/` for a visual check.
