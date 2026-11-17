const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const fs = require("fs");
const path = require("path");
const store = require("./store");

// Fixes a known Windows bug where clicks land at the wrong pixel (no cursor,
// no focus) on non-100% display scaling (125%/150%) by forcing correct
// per-monitor DPI handling instead of relying on auto-detection.
app.commandLine.appendSwitch("high-dpi-support", "1");

let mainWindow;

function userDataPath() {
  return app.getPath("userData");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 850,
    icon: path.join(__dirname, "..", "assets", "logo.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, "..", "index.html"));
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// =======================
// GENERIC STORE HANDLERS
// =======================
ipcMain.handle("invoices:get", () => store.readStore(userDataPath(), "invoices"));

ipcMain.handle("invoices:save", (event, invoice) => {
  const invoices = store.readStore(userDataPath(), "invoices");
  const idx = invoices.findIndex(i => i.invoiceNumber === invoice.invoiceNumber);
  if (idx >= 0) invoices[idx] = invoice;
  else invoices.push(invoice);
  store.writeStore(userDataPath(), "invoices", invoices);
  return invoice;
});

ipcMain.handle("documents:get", (event, docType) => {
  const documents = store.readStore(userDataPath(), "documents");
  return docType ? documents.filter(d => d.docType === docType) : documents;
});

ipcMain.handle("documents:save", (event, doc) => {
  const documents = store.readStore(userDataPath(), "documents");
  const idx = documents.findIndex(d => d.docNumber === doc.docNumber);
  if (idx >= 0) documents[idx] = doc;
  else documents.push(doc);
  store.writeStore(userDataPath(), "documents", documents);
  return doc;
});

ipcMain.handle("patients:get", () => store.readStore(userDataPath(), "patients"));

ipcMain.handle("patients:getOne", (event, id) => {
  const patients = store.readStore(userDataPath(), "patients");
  return patients.find(p => p.id === id) || null;
});

ipcMain.handle("patients:save", (event, patient) => {
  const patients = store.readStore(userDataPath(), "patients");
  if (!patient.id) {
    patient.id = "P" + Date.now().toString(36).toUpperCase();
    patient.linkedDocuments = patient.linkedDocuments || [];
    patient.billingTotal = patient.billingTotal || 0;
  }
  const idx = patients.findIndex(p => p.id === patient.id);
  if (idx >= 0) patients[idx] = patient;
  else patients.push(patient);
  store.writeStore(userDataPath(), "patients", patients);
  return patient;
});

ipcMain.handle("patients:linkDocument", (event, { patientId, docType, docNumber, date, amount }) => {
  const patients = store.readStore(userDataPath(), "patients");
  const patient = patients.find(p => p.id === patientId);
  if (!patient) return null;
  patient.linkedDocuments = patient.linkedDocuments || [];
  patient.linkedDocuments.push({ docType, docNumber, date });
  if (docType === "invoice" && typeof amount === "number") {
    patient.billingTotal = (patient.billingTotal || 0) + amount;
  }
  store.writeStore(userDataPath(), "patients", patients);
  return patient;
});

// =======================
// DOCUMENT NUMBERING
// =======================
ipcMain.handle("counters:next", (event, prefix) => {
  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "short" });
  const year = now.getFullYear().toString().slice(-2);
  const monthKey = `${prefix}_${month}${year}`;

  const counters = store.readStore(userDataPath(), "counters");
  const nextNumber = (counters[monthKey] || 0) + 1;
  counters[monthKey] = nextNumber;
  store.writeStore(userDataPath(), "counters", counters);

  return `${prefix}_${month}${year}_${String(nextNumber).padStart(2, "0")}`;
});

// =======================
// SETTINGS
// =======================
ipcMain.handle("settings:get", () => store.readStore(userDataPath(), "settings"));

ipcMain.handle("settings:set", (event, partial) => {
  const settings = store.readStore(userDataPath(), "settings");
  Object.assign(settings, partial);
  store.writeStore(userDataPath(), "settings", settings);
  return settings;
});

ipcMain.handle("settings:pickFolder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// =======================
// PDF SAVING
// =======================
ipcMain.handle("pdf:save", (event, { buffer, docType, docNumber }) => {
  const settings = store.readStore(userDataPath(), "settings");
  const baseFolder = settings.pdfFolder || path.join(userDataPath(), "pdfs");
  const folder = path.join(baseFolder, docType);
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

  const filePath = path.join(folder, `${docNumber}.pdf`);
  fs.writeFileSync(filePath, Buffer.from(buffer));
  return filePath;
});

// =======================
// BACKUP EXPORT / IMPORT
// =======================
ipcMain.handle("backup:export", () => {
  const settings = store.readStore(userDataPath(), "settings");
  const backupFolder = settings.backupFolder || path.join(userDataPath(), "backups");
  if (!fs.existsSync(backupFolder)) fs.mkdirSync(backupFolder, { recursive: true });

  const snapshot = {
    exportedAt: new Date().toISOString(),
    invoices: store.readStore(userDataPath(), "invoices"),
    documents: store.readStore(userDataPath(), "documents"),
    patients: store.readStore(userDataPath(), "patients"),
    counters: store.readStore(userDataPath(), "counters")
  };

  const stamp = snapshot.exportedAt.replace(/[:.]/g, "-");
  const filePath = path.join(backupFolder, `easywalk-backup-${stamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf-8");
  return filePath;
});

ipcMain.handle("backup:import", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "EasyWalk Backup", extensions: ["json"] }]
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const snapshot = JSON.parse(fs.readFileSync(result.filePaths[0], "utf-8"));
  if (snapshot.invoices) store.writeStore(userDataPath(), "invoices", snapshot.invoices);
  if (snapshot.documents) store.writeStore(userDataPath(), "documents", snapshot.documents);
  if (snapshot.patients) store.writeStore(userDataPath(), "patients", snapshot.patients);
  if (snapshot.counters) store.writeStore(userDataPath(), "counters", snapshot.counters);

  return { restoredFrom: result.filePaths[0] };
});
