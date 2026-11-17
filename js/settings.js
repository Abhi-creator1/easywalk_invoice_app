// =======================
// SETTINGS
// =======================
// The desktop build's two folder pickers do not apply in a browser (PDFs go to
// the browser's downloads folder), so this view instead reports where the data
// actually lives, how much of it there is, and handles backup/restore and
// installing the app to the home screen.

let installPromptEvent = null;

async function loadSettingsView() {
  const stats = await run(() => window.api.getStats(), {
    failure: "Could not read the local database."
  });

  const el = document.getElementById("storageStats");
  if (el && stats.ok) {
    el.innerHTML =
      "<li><strong>" + stats.value.invoices + "</strong> invoices</li>" +
      "<li><strong>" + stats.value.documents + "</strong> protocols &amp; certificates</li>" +
      "<li><strong>" + stats.value.patients + "</strong> IPD patient profiles</li>";
  }

  const quota = document.getElementById("storageQuota");
  if (quota && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const usedMb = (estimate.usage || 0) / (1024 * 1024);
      quota.textContent = "Using about " + usedMb.toFixed(1) + " MB of this browser's storage.";
    } catch (err) {
      quota.textContent = "";
    }
  }

  const worker = document.getElementById("offlineStatus");
  if (worker) {
    const ready = navigator.serviceWorker && navigator.serviceWorker.controller;
    worker.textContent = ready
      ? "Offline mode is active — the app will open without internet."
      : "Offline mode will activate after the next reload.";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadSettingsView();

  document.getElementById("exportBackupBtn").addEventListener("click", async () => {
    const result = await run(() => window.api.exportBackup(), {
      failure: "The backup could not be created."
    });
    if (!result.ok) return;
    document.getElementById("backupStatus").textContent = "Backup downloaded: " + result.value;
    toast("Backup downloaded.", "success");
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

  // Install to the home screen / desktop. Chrome fires this event only when the
  // app is installable and not already installed.
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
