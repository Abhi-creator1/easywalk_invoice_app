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
  mainWindow.on("closed", () => { mainWindow = null; });
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

// Every handler below mirrors a method in js/platform/api.web.js, so the
// renderer behaves identically whether it is running here or in a browser.

const read = name => store.readStore(userDataPath(), name);
const write = (name, data) => store.writeStore(userDataPath(), name, data);

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// =======================
// INVOICES
// =======================
ipcMain.handle("invoices:get", () => read("invoices"));

ipcMain.handle("invoices:getOne", (event, invoiceNumber) => {
  const invoices = read("invoices");
  return invoices.find(i => i.invoiceNumber === invoiceNumber) || null;
});

ipcMain.handle("invoices:save", (event, invoice) => {
  const invoices = read("invoices");
  const idx = invoices.findIndex(i => i.invoiceNumber === invoice.invoiceNumber);
  if (idx >= 0) invoices[idx] = invoice;
  else invoices.push(invoice);
  write("invoices", invoices);
  return invoice;
});

ipcMain.handle("invoices:delete", (event, invoiceNumber) => {
  const invoices = read("invoices");
  const invoice = invoices.find(i => i.invoiceNumber === invoiceNumber);
  if (!invoice) return false;

  write("invoices", invoices.filter(i => i.invoiceNumber !== invoiceNumber));
  if (invoice.patientId) unlinkDocument(invoice.patientId, "invoice", invoiceNumber);
  return true;
});

// =======================
// DOCUMENTS
// =======================
ipcMain.handle("documents:get", (event, docType) => {
  const documents = read("documents");
  return docType ? documents.filter(d => d.docType === docType) : documents;
});

ipcMain.handle("documents:getOne", (event, docNumber) => {
  const documents = read("documents");
  return documents.find(d => d.docNumber === docNumber) || null;
});

ipcMain.handle("documents:save", (event, doc) => {
  const documents = read("documents");
  const idx = documents.findIndex(d => d.docNumber === doc.docNumber);
  if (idx >= 0) documents[idx] = doc;
  else documents.push(doc);
  write("documents", documents);
  return doc;
});

ipcMain.handle("documents:delete", (event, docNumber) => {
  const documents = read("documents");
  const doc = documents.find(d => d.docNumber === docNumber);
  if (!doc) return false;

  write("documents", documents.filter(d => d.docNumber !== docNumber));
  if (doc.patientId) unlinkDocument(doc.patientId, doc.docType, docNumber);
  return true;
});

// =======================
// PATIENTS
// =======================
ipcMain.handle("patients:get", () => read("patients"));

ipcMain.handle("patients:getOne", (event, id) => {
  const patients = read("patients");
  return patients.find(p => p.id === id) || null;
});

ipcMain.handle("patients:save", (event, patient) => {
  const patients = read("patients");
  if (!patient.id) {
    patient.id = "P" + Date.now().toString(36).toUpperCase();
    patient.linkedDocuments = patient.linkedDocuments || [];
    patient.billingTotal = patient.billingTotal || 0;
  }
  const idx = patients.findIndex(p => p.id === patient.id);
  if (idx >= 0) patients[idx] = patient;
  else patients.push(patient);
  write("patients", patients);
  return patient;
});

ipcMain.handle("patients:delete", (event, id) => {
  const patients = read("patients");
  write("patients", patients.filter(p => p.id !== id));
  return true;
});

// Idempotent on (docType, docNumber): re-saving the same invoice updates the
// existing row and applies only the difference to the running total, rather
// than appending a duplicate and adding the full amount again.
ipcMain.handle("patients:linkDocument", (event, { patientId, docType, docNumber, date, amount }) => {
  const patients = read("patients");
  const patient = patients.find(p => p.id === patientId);
  if (!patient) return null;

  patient.linkedDocuments = patient.linkedDocuments || [];
  patient.billingTotal = toNumber(patient.billingTotal);

  const existing = patient.linkedDocuments.find(
    doc => doc.docType === docType && doc.docNumber === docNumber);
  const newAmount = typeof amount === "number" ? amount : null;

  if (existing) {
    existing.date = date;
    if (newAmount !== null) {
      patient.billingTotal += newAmount - toNumber(existing.amount);
      existing.amount = newAmount;
    }
  } else {
    const entry = { docType, docNumber, date };
    if (newAmount !== null) {
      entry.amount = newAmount;
      patient.billingTotal += newAmount;
    }
    patient.linkedDocuments.push(entry);
  }

  write("patients", patients);
  return patient;
});

function unlinkDocument(patientId, docType, docNumber) {
  const patients = read("patients");
  const patient = patients.find(p => p.id === patientId);
  if (!patient) return null;

  const remaining = [];
  let removedAmount = 0;
  (patient.linkedDocuments || []).forEach(doc => {
    if (doc.docType === docType && doc.docNumber === docNumber) {
      removedAmount += toNumber(doc.amount);
    } else {
      remaining.push(doc);
    }
  });

  patient.linkedDocuments = remaining;
  patient.billingTotal = Math.max(0, toNumber(patient.billingTotal) - removedAmount);
  write("patients", patients);
  return patient;
}

// =======================
// DOCUMENT NUMBERING
// =======================
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const MONTH_NAMES_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthKeyFor(prefix, options) {
  const opts = options || {};
  const now = new Date();
  const month = opts.monthStyle === "long"
    ? MONTH_NAMES[now.getMonth()]
    : MONTH_NAMES_SHORT[now.getMonth()];
  return prefix + "_" + month + String(now.getFullYear()).slice(-2);
}

ipcMain.handle("counters:next", (event, prefix, options) => {
  const monthKey = monthKeyFor(prefix, options);
  const counters = read("counters");
  const nextNumber = (counters[monthKey] || 0) + 1;
  counters[monthKey] = nextNumber;
  write("counters", counters);
  return monthKey + "_" + String(nextNumber).padStart(2, "0");
});

// Reports the next number without consuming it, so the invoice field can show
// a suggestion that only becomes real on save and the sequence stays gapless.
ipcMain.handle("counters:peek", (event, prefix, options) => {
  const monthKey = monthKeyFor(prefix, options);
  const counters = read("counters");
  return monthKey + "_" + String((counters[monthKey] || 0) + 1).padStart(2, "0");
});

// =======================
// SETTINGS
// =======================
ipcMain.handle("settings:get", () => read("settings"));

ipcMain.handle("settings:set", (event, partial) => {
  const settings = read("settings");
  Object.assign(settings, partial);
  write("settings", settings);
  return settings;
});

ipcMain.handle("settings:pickFolder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle("stats:get", () => ({
  invoices: read("invoices").length,
  documents: read("documents").length,
  patients: read("patients").length
}));

// =======================
// PDF SAVING
// =======================
ipcMain.handle("pdf:save", (event, { buffer, docType, docNumber }) => {
  const settings = read("settings");
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
  const settings = read("settings");
  const backupFolder = settings.backupFolder || path.join(userDataPath(), "backups");
  if (!fs.existsSync(backupFolder)) fs.mkdirSync(backupFolder, { recursive: true });

  const snapshot = {
    app: "easywalk-docs",
    exportedAt: new Date().toISOString(),
    invoices: read("invoices"),
    documents: read("documents"),
    patients: read("patients"),
    counters: read("counters"),
    // Included so a restore on a new machine also brings the folder choices.
    settings
  };

  const stamp = snapshot.exportedAt.replace(/[:.]/g, "-");
  const filePath = path.join(backupFolder, `easywalk-backup-${stamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf-8");
  return filePath;
});

const BACKUP_COLLECTIONS = ["invoices", "documents", "patients"];

function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("That file is not an EasyWalk backup.");
  }
  const present = BACKUP_COLLECTIONS.filter(name => snapshot[name] !== undefined);
  if (present.length === 0) {
    throw new Error("That file has no invoices, documents or patients in it.");
  }
  present.forEach(name => {
    if (!Array.isArray(snapshot[name])) {
      throw new Error('That backup\'s "' + name + '" section is damaged.');
    }
  });
  ["counters", "settings"].forEach(name => {
    const value = snapshot[name];
    if (value !== undefined && (typeof value !== "object" || value === null || Array.isArray(value))) {
      throw new Error('That backup\'s "' + name + '" section is damaged.');
    }
  });
  return present;
}

ipcMain.handle("backup:import", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "EasyWalk Backup", extensions: ["json"] }]
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const chosen = result.filePaths[0];
  let snapshot;
  try {
    snapshot = JSON.parse(fs.readFileSync(chosen, "utf-8"));
  } catch (err) {
    throw new Error("That file is not valid JSON, so it cannot be a backup.");
  }

  const present = validateSnapshot(snapshot);

  // Restoring replaces everything, so it must never happen on a single misclick.
  const summary = present
    .map(name => "  " + name + ": " + read(name).length + " here -> " + snapshot[name].length + " from the backup")
    .join("\n");

  const choice = dialog.showMessageBoxSync(mainWindow, {
    type: "warning",
    buttons: ["Cancel", "Replace my data"],
    defaultId: 0,
    cancelId: 0,
    title: "Restore backup",
    message: "Restoring this backup REPLACES the data on this computer.",
    detail: summary + "\n\nThis cannot be undone. Export a backup first if you are unsure."
  });
  if (choice !== 1) return null;

  present.forEach(name => write(name, snapshot[name]));
  if (snapshot.counters) write("counters", snapshot.counters);
  if (snapshot.settings) write("settings", snapshot.settings);

  return { restoredFrom: path.basename(chosen) };
});
