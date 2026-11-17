// =======================
// SETTINGS
// =======================
async function loadSettings() {
  const settings = await window.api.getSettings();
  document.getElementById("pdfFolderPath").value = settings.pdfFolder || "(not set — using app data folder)";
  document.getElementById("backupFolderPath").value = settings.backupFolder || "(not set — using app data folder)";
}

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();

  document.getElementById("pickPdfFolderBtn").addEventListener("click", async () => {
    const folder = await window.api.pickFolder();
    if (!folder) return;
    await window.api.setSettings({ pdfFolder: folder });
    loadSettings();
  });

  document.getElementById("pickBackupFolderBtn").addEventListener("click", async () => {
    const folder = await window.api.pickFolder();
    if (!folder) return;
    await window.api.setSettings({ backupFolder: folder });
    loadSettings();
  });

  document.getElementById("exportBackupBtn").addEventListener("click", async () => {
    const filePath = await window.api.exportBackup();
    document.getElementById("backupStatus").innerText = `Backup exported to: ${filePath}`;
  });

  document.getElementById("importBackupBtn").addEventListener("click", async () => {
    const result = await window.api.importBackup();
    if (!result) return;
    document.getElementById("backupStatus").innerText = `Backup restored from: ${result.restoredFrom}. Reloading...`;
    setTimeout(() => window.location.reload(), 1200);
  });
});
