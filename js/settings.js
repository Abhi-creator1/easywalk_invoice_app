// =======================
// SETTINGS
// =======================
// Shared by both builds. The desktop build writes PDFs and backups into folders
// the user picks; the web build hands them to the browser's download machinery,
// where folders are not a thing. Everything else is identical, so this view
// adapts to the platform rather than the file being forked.

const IS_DESKTOP = !!(window.api && window.api.platform === "desktop");

let installPromptEvent = null;

async function loadSettingsView() {
  const stats = await run(() => window.api.getStats(), {
    failure: "Could not read how much is stored."
  });

  const list = document.getElementById("storageStats");
  if (list && stats.ok) {
    list.innerHTML =
      "<li><strong>" + stats.value.invoices + "</strong> invoices</li>" +
      "<li><strong>" + stats.value.documents + "</strong> protocols &amp; certificates</li>" +
      "<li><strong>" + stats.value.patients + "</strong> IPD patient profiles</li>";
  }

  const where = document.getElementById("storageWhere");
  if (where) {
    where.textContent = IS_DESKTOP
      ? "Everything you save is stored on this computer, in the app's own data folder. " +
        "Replacing the application file does not touch it."
      : "Everything you save is stored in this browser, on this device. Opening the app on " +
        "another phone or PC gives you a separate, empty set of records — use the backup " +
        "below to move data between them.";
  }

  const pdfNote = document.getElementById("pdfLocationNote");
  if (pdfNote) {
    pdfNote.textContent = IS_DESKTOP
      ? "Generated PDFs are filed by document type inside the PDF output folder above."
      : "Generated PDFs are saved by the browser to its usual downloads folder. On a phone, " +
        "use the share sheet from the download notification to send one to WhatsApp or e-mail.";
  }

  const offline = document.getElementById("offlineStatus");
  if (offline) {
    if (IS_DESKTOP) {
      offline.textContent = "This app runs entirely offline.";
    } else {
      const ready = navigator.serviceWorker && navigator.serviceWorker.controller;
      offline.textContent = ready
        ? "Offline mode is active — the app will open without internet."
        : "Offline mode will activate after the next reload.";
    }
  }

  const quota = document.getElementById("storageQuota");
  if (quota && !IS_DESKTOP && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      quota.textContent = "Using about " +
        ((estimate.usage || 0) / (1024 * 1024)).toFixed(1) + " MB of this browser's storage.";
    } catch (err) {
      quota.textContent = "";
    }
  }

  if (IS_DESKTOP) await loadFolderSettings();
}

// ---------- desktop-only folder pickers ----------
async function loadFolderSettings() {
  const card = document.getElementById("desktopFoldersCard");
  if (card) card.hidden = false;

  const result = await run(() => window.api.getSettings(), {
    failure: "Could not read the folder settings."
  });
  if (!result.ok) return;

  const settings = result.value || {};
  document.getElementById("pdfFolderPath").value =
    settings.pdfFolder || "(not set — using the app data folder)";
  document.getElementById("backupFolderPath").value =
    settings.backupFolder || "(not set — using the app data folder)";
}

async function pickFolderInto(key) {
  const picked = await run(() => window.api.pickFolder(), {
    failure: "Could not open the folder chooser."
  });
  if (!picked.ok || !picked.value) return;

  const partial = {};
  partial[key] = picked.value;

  const saved = await run(() => window.api.setSettings(partial), {
    failure: "Could not save that folder."
  });
  if (saved.ok) {
    await loadFolderSettings();
    toast("Folder saved.", "success");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadSettingsView();

  const pdfBtn = document.getElementById("pickPdfFolderBtn");
  const backupBtn = document.getElementById("pickBackupFolderBtn");
  if (pdfBtn) pdfBtn.addEventListener("click", () => pickFolderInto("pdfFolder"));
  if (backupBtn) backupBtn.addEventListener("click", () => pickFolderInto("backupFolder"));

  document.getElementById("exportBackupBtn").addEventListener("click", async () => {
    const result = await run(() => window.api.exportBackup(), {
      failure: "The backup could not be created."
    });
    if (!result.ok) return;
    document.getElementById("backupStatus").textContent = "Backup saved: " + result.value;
    toast("Backup saved.", "success");
  });

  document.getElementById("importBackupBtn").addEventListener("click", async () => {
    const result = await run(() => window.api.importBackup(), {
      failure: "The backup could not be restored."
    });
    if (!result.ok || !result.value) return;

    document.getElementById("backupStatus").textContent =
      "Restored from " + result.value.restoredFrom + ". Reloading...";
    setTimeout(() => window.location.reload(), 1200);
  });

  // Install to the home screen / desktop. Chrome fires this only when the app
  // is installable and not already installed; it never fires in the desktop
  // build, so the button simply stays hidden there.
  const installBtn = document.getElementById("installAppBtn");
  if (installBtn) {
    window.addEventListener("beforeinstallprompt", event => {
      event.preventDefault();
      installPromptEvent = event;
      installBtn.hidden = false;
    });

    installBtn.addEventListener("click", async () => {
      if (!installPromptEvent) return;
      installPromptEvent.prompt();
      installPromptEvent = null;
      installBtn.hidden = true;
    });
  }
});

// Keep the counts fresh when the user switches to Settings after saving things.
document.addEventListener("easywalk:viewchange", event => {
  if (event.detail === "settings") loadSettingsView();
});
