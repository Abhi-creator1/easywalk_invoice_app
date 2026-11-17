// Browser implementation of the exact contract electron/preload.js exposes.
//
// Every feature file reaches storage through window.api (via js/db.js), so
// providing the same method names here lets the whole app run unchanged in a
// browser. The guard below means this file is also safe to ship in the desktop
// build, where Electron's preload has already installed the real window.api --
// which is what keeps the two branches from drifting apart.
(function installWebApi() {
  if (window.api) return;

  // ---------- document numbering ----------
  // Desktop parity: TP_Nov25_01, CERT_Nov25_03, ...
  // Invoices pass monthStyle "long" to keep the clinic's existing
  // EW_November25 convention, now with a sequence appended so the second
  // invoice of a month can no longer overwrite the first.
  function monthKeyFor(prefix, options) {
    const opts = options || {};
    const now = new Date();
    const month = opts.monthStyle === "long"
      ? MONTH_NAMES[now.getMonth()]
      : MONTH_NAMES_SHORT[now.getMonth()];
    const year = String(now.getFullYear()).slice(-2);
    return prefix + "_" + month + year;
  }

  async function nextDocNumber(prefix, options) {
    const monthKey = monthKeyFor(prefix, options);

    const next = await store.meta.update("counters", {}, counters => {
      const value = Object.assign({}, counters);
      value[monthKey] = (value[monthKey] || 0) + 1;
      return { value: value, result: value[monthKey] };
    });

    return monthKey + "_" + pad2(next);
  }

  // Shows what the next number will be without consuming it, so the invoice
  // field can display a suggestion that only becomes real on save. Keeps the
  // sequence gapless when the user opens the app and saves nothing.
  async function peekDocNumber(prefix, options) {
    const monthKey = monthKeyFor(prefix, options);
    const counters = await store.meta.get("counters", {});
    return monthKey + "_" + pad2((counters[monthKey] || 0) + 1);
  }

  // ---------- patients ----------
  async function savePatient(patient) {
    const record = Object.assign({}, patient);
    if (!record.id) {
      record.id = "P" + Date.now().toString(36).toUpperCase();
      record.linkedDocuments = record.linkedDocuments || [];
      record.billingTotal = record.billingTotal || 0;
    }
    await store.put("patients", record);
    return record;
  }

  // Idempotent on (docType, docNumber). Re-saving the same invoice updates the
  // existing row and applies only the difference to the running total, instead
  // of appending a duplicate and adding the full amount a second time.
  async function linkPatientDocument(payload) {
    const patientId = payload.patientId;
    const docType = payload.docType;
    const docNumber = payload.docNumber;
    const date = payload.date;
    const amount = payload.amount;

    const patient = await store.get("patients", patientId);
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
      const entry = { docType: docType, docNumber: docNumber, date: date };
      if (newAmount !== null) {
        entry.amount = newAmount;
        patient.billingTotal += newAmount;
      }
      patient.linkedDocuments.push(entry);
    }

    await store.put("patients", patient);
    return patient;
  }

  async function unlinkPatientDocument(patientId, docType, docNumber) {
    if (!patientId) return null;
    const patient = await store.get("patients", patientId);
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
    await store.put("patients", patient);
    return patient;
  }

  // ---------- backup ----------
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

  async function exportBackup() {
    const results = await Promise.all([
      store.readAll("invoices"),
      store.readAll("documents"),
      store.readAll("patients"),
      store.meta.get("counters", {}),
      store.meta.get("settings", {})
    ]);

    const snapshot = {
      app: "easywalk-docs",
      exportedAt: new Date().toISOString(),
      invoices: results[0],
      documents: results[1],
      patients: results[2],
      counters: results[3],
      settings: results[4]
    };

    const stamp = snapshot.exportedAt.replace(/[:.]/g, "-");
    return downloadJson(snapshot, "easywalk-backup-" + stamp + ".json");
  }

  async function importBackup() {
    const file = await pickFile("application/json,.json");
    if (!file) return null;

    let snapshot;
    try {
      snapshot = JSON.parse(await readFileAsText(file));
    } catch (err) {
      throw new Error("That file is not valid JSON, so it cannot be a backup.");
    }

    const present = validateSnapshot(snapshot);

    const current = await store.counts();
    const summary = present
      .map(name => "  " + name + ": " + current[name] + " here -> " + snapshot[name].length + " from the backup")
      .join("\n");

    const confirmed = window.confirm(
      "Restoring this backup REPLACES the data on this device.\n\n" + summary + "\n\n" +
      "This cannot be undone. Export a backup first if you are unsure.\n\nContinue?");
    if (!confirmed) return null;

    for (const name of present) {
      await store.replaceAll(name, snapshot[name]);
    }
    if (snapshot.counters) await store.meta.set("counters", snapshot.counters);
    if (snapshot.settings) await store.meta.set("settings", snapshot.settings);

    return { restoredFrom: file.name };
  }

  // ---------- the contract ----------
  window.api = {
    platform: "web",

    getInvoices: () => store.readAll("invoices"),
    getInvoice: invoiceNumber => store.get("invoices", invoiceNumber),
    saveInvoice: invoice => store.put("invoices", invoice),
    deleteInvoice: async invoiceNumber => {
      const invoice = await store.get("invoices", invoiceNumber);
      if (!invoice) return false;
      await store.remove("invoices", invoiceNumber);
      if (invoice.patientId) {
        await unlinkPatientDocument(invoice.patientId, "invoice", invoiceNumber);
      }
      return true;
    },

    getDocuments: docType => (docType
      ? store.byIndex("documents", "docType", docType)
      : store.readAll("documents")),
    getDocument: docNumber => store.get("documents", docNumber),
    saveDocument: doc => store.put("documents", doc),
    deleteDocument: async docNumber => {
      const doc = await store.get("documents", docNumber);
      if (!doc) return false;
      await store.remove("documents", docNumber);
      if (doc.patientId) {
        await unlinkPatientDocument(doc.patientId, doc.docType, docNumber);
      }
      return true;
    },

    getPatients: () => store.readAll("patients"),
    getPatient: id => store.get("patients", id),
    savePatient: savePatient,
    deletePatient: id => store.remove("patients", id),
    linkPatientDocument: linkPatientDocument,

    nextDocNumber: nextDocNumber,
    peekDocNumber: peekDocNumber,

    getSettings: () => store.meta.get("settings", {}),
    setSettings: async partial => {
      const settings = await store.meta.get("settings", {});
      return store.meta.set("settings", Object.assign({}, settings, partial));
    },
    // Folders are a desktop-only concept; the UI hides the pickers on web.
    pickFolder: async () => null,

    savePdf: (buffer, docType, docNumber) =>
      downloadBytes(buffer, docNumber + ".pdf", "application/pdf"),

    exportBackup: exportBackup,
    importBackup: importBackup,

    getStats: () => store.counts()
  };
})();
