# EasyWalk Documentation — Desktop App (offline branch)

Offline Windows desktop app (Electron) for EasyWalk Physiotherapy and Rehabilitation Centre —
invoices, treatment protocols, certificates, additional documents and IPD patient profiles. All
data and generated PDFs are stored locally; no internet connection or account required.

> **Branches**
> - `master` — the web app. This is the one the clinic uses now: it runs in a browser, installs to
>   a phone, and is much lighter on the 4 GB clinic PC.
> - `offline-app` — this branch. Kept as a working desktop fallback, feature-matched to the web app.

## How this relates to the web app

`index.html`, `css/` and `js/` are **identical** to `master`. The only difference is how storage is
provided:

| | Web (`master`) | Desktop (this branch) |
|---|---|---|
| `window.api` from | `js/platform/api.web.js` | `electron/preload.js` |
| Records stored in | IndexedDB | JSON files in `%APPDATA%\easywalk-docs\data` |
| PDFs go to | the browser's downloads | the PDF output folder in Settings |
| Backup file | downloaded | written to the backup folder in Settings |

`js/platform/api.web.js` only installs itself when `window.api` is absent, so it is inert here. That
means a change to any shared file can be moved between branches with a plain
`git checkout <branch> -- <path>` rather than being re-implemented.

## Building the app

Run these on your own development machine (requires [Node.js](https://nodejs.org)):

```
npm install
npm run dist
```

This produces a single portable executable at:

```
dist/EasyWalk Documentation 2.0.0.exe
```

> Note: the Windows build target is `portable`, not a traditional installer. electron-builder's
> NSIS installer target was tried first but crashes on launch due to a bug in its bundled
> `System.dll` plugin (unrelated to this app's code) — the portable target avoids that entirely.

## Installing on the clinic PC

1. Copy `EasyWalk Documentation 2.0.0.exe` to the target PC (USB drive, remote session, etc.) —
   it's fully self-contained, nothing else needs to be installed.
2. Double-click it to run. Windows SmartScreen may show an "Unknown publisher" warning the first
   time since the executable isn't code-signed — click **More info → Run anyway**.
3. There is no installer step — this one file *is* the app. To pin it for everyday use:
   - Right-click the `.exe` → **Send to → Desktop (create shortcut)**, and/or
   - Right-click the `.exe` → **Pin to Start** / **Pin to taskbar**.
4. On first launch, open the **Settings** tab and set:
   - **PDF Output Folder** — where generated PDFs are saved (filed by document type).
   - **Backup Folder** — where exported JSON backups are saved.

   If left unset, both default to a folder inside the app's own data directory
   (`%APPDATA%\easywalk-docs`).

## Updating the app on the clinic PC

1. On your dev machine, make your changes, then run `npm run dist` again to produce a new `.exe`.
2. Copy the new `.exe` over to the clinic PC and run it in place of the old one.
3. All patient data, invoices, documents and settings live separately under
   `%APPDATA%\easywalk-docs\` and are untouched by replacing the executable.

## Backing up / moving to a new machine

**Settings → Export Backup** writes a timestamped JSON snapshot of all invoices, documents,
patients, counters and settings to the configured backup folder. On the new machine use
**Import Backup** and select that file. Importing replaces everything on the machine, so it asks
for confirmation first and refuses files that are not valid backups.

The same backup file can be imported into the web app, and vice versa — the stored shape is the
same on both.

## Data safety

Each store is written to a temporary file and then renamed into place, so an interrupted write can
never leave a half-written file behind. If a store file is ever found unreadable it is moved aside
as `<name>.json.corrupt-<timestamp>` rather than being overwritten, so nothing is lost silently.

## Document numbering

| Document | Format | Example |
|---|---|---|
| Invoice | `EW_<Month><yy>_<nn>` | `EW_November26_03` |
| Treatment protocol | `TP_<Mon><yy>_<nn>` | `TP_Nov26_03` |
| Certificate | `CERT_<Mon><yy>_<nn>` | `CERT_Nov26_01` |

The sequence restarts each month. The invoice number shown in the form is a suggestion that is only
consumed when you save, so the sequence stays gapless; it can still be typed over, and saving onto
an existing number asks first.

## Selecting treatment dates

One calendar handles every case: **tap** a date to toggle it, **drag** across dates for a span,
**shift-tap** to extend, drag back over selected dates to clear them, or use **Whole month** /
**Weekdays**. Dates can also just be typed: `3/11/26, 7/11/26, 10/11/26 - 14/11/26`.

## Tests

```
npm test
```

Boots the real `electron/main.js` against a throwaway data folder and drives the app: it checks
that the preload exposes every `window.api` method the shared renderer calls, that document
numbering, patient billing links and deletes behave the same as on the web, that the JSON store
survives corruption, and that each document prints the right number of pages. A window appears for
the few seconds the run takes.

Clinic details (name, address, PAN, phone) live in **[js/config/clinic.js](js/config/clinic.js)**
and nowhere else.
