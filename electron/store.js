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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

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
  if (!fs.existsSync(file)) return clone(DEFAULTS[storeName]);

  // An I/O failure (locked file, bad permissions) is surfaced rather than
  // swallowed: returning an empty list here would look like "no data yet",
  // and the next save would then write that emptiness over the real file.
  const raw = fs.readFileSync(file, "utf-8");

  try {
    return JSON.parse(raw);
  } catch (err) {
    // Unparseable JSON means a previous write was interrupted. Move the file
    // aside instead of leaving it to be overwritten, so nothing is lost and it
    // can still be recovered by hand.
    const quarantined = file + ".corrupt-" + Date.now();
    try {
      fs.renameSync(file, quarantined);
      console.error("Unreadable " + storeName + " file moved to " + quarantined, err);
    } catch (renameErr) {
      console.error("Unreadable " + storeName + " file could not be set aside", renameErr);
    }
    return clone(DEFAULTS[storeName]);
  }
}

// Written to a temporary file and then renamed into place. A rename is atomic,
// so a crash or power cut can never leave a half-written store behind.
function writeStore(userDataPath, storeName, data) {
  const file = filePath(userDataPath, storeName);
  const temp = file + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(temp, file);
}

module.exports = { STORE_FILES, DEFAULTS, dataDir, filePath, readStore, writeStore };
