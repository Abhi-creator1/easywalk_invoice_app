# EasyWalk Documentation App

Offline desktop app (Electron) for EasyWalk Physiotherapy and Rehabilitation Centre — invoices, treatment protocols, certificates, additional documents, and IPD patient profiles. All data and generated PDFs are stored locally; no internet connection or Google account required.

## Building the app

Run these on your own development machine (requires [Node.js](https://nodejs.org)):

```
npm install
npm run dist
```

This produces a single portable executable at:

```
dist/EasyWalk Documentation 1.0.0.exe
```

> Note: the Windows build target is `portable`, not a traditional installer. electron-builder's NSIS installer target was tried first but crashes on launch due to a bug in its bundled `System.dll` plugin (unrelated to this app's code) — the portable target avoids that entirely.

## Installing on the clinic PC

1. Copy `EasyWalk Documentation 1.0.0.exe` to the target PC (USB drive, remote session, etc.) — it's fully self-contained, nothing else needs to be installed.
2. Double-click it to run. Windows SmartScreen may show an "Unknown publisher" warning the first time since the executable isn't code-signed — click **More info → Run anyway**.
3. There is no installer step — this one file *is* the app. To pin it for everyday use:
   - Right-click the `.exe` → **Send to → Desktop (create shortcut)**, and/or
   - Right-click the `.exe` → **Pin to Start** / **Pin to taskbar**.
4. On first launch, open the **Settings** tab and set:
   - **PDF Output Folder** — where generated invoice/protocol/certificate PDFs are saved.
   - **Backup Folder** — where exported JSON backups are saved.

   If left unset, both default to a folder inside the app's own data directory (`%APPDATA%\easywalk-docs`).

## Updating the app on the clinic PC

1. On your dev machine, make your changes, then run `npm run dist` again to produce a new `.exe`.
2. Copy the new `.exe` over to the clinic PC and run it in place of the old one (same filename/location, or replace the shortcut target).
3. All patient data, invoices, documents, and settings live separately under `%APPDATA%\easywalk-docs\` and are untouched by replacing the executable.

## Backing up / moving to a new machine

Use the **Settings** tab's **Export Backup** button to write a timestamped JSON snapshot of all invoices, documents, and patients to the configured backup folder. On the new machine, use **Import Backup** and select that file to restore everything.
