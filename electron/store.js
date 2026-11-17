const fs = require("fs");
const path = require("path");

const STORE_FILES = {
  invoices: "invoices.json",
  documents: "documents.json",
  patients: "patients.json",
  counters: "counters.json",
  settings: "settings.json"
};

const DEFAULTS = {
  invoices: [],
  documents: [],
  patients: [],
  counters: {},
  settings: { pdfFolder: "", backupFolder: "" }
};

function dataDir(userDataPath) {
  const dir = path.join(userDataPath, "data");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function filePath(userDataPath, storeName) {
  return path.join(dataDir(userDataPath), STORE_FILES[storeName]);
}

function readStore(userDataPath, storeName) {
  const file = filePath(userDataPath, storeName);
  if (!fs.existsSync(file)) {
    return JSON.parse(JSON.stringify(DEFAULTS[storeName]));
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (err) {
    console.error(`Failed to read ${storeName}:`, err);
    return JSON.parse(JSON.stringify(DEFAULTS[storeName]));
  }
}

function writeStore(userDataPath, storeName, data) {
  const file = filePath(userDataPath, storeName);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

module.exports = { STORE_FILES, DEFAULTS, dataDir, filePath, readStore, writeStore };
