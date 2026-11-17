// Smoke test for the desktop build.
//
// Runs with:  npm test
//
// Boots the real electron/main.js (so the real IPC handlers and preload are in
// play) against a throwaway userData folder, then drives the renderer. The
// point is parity: the renderer is shared byte-for-byte with the web app on
// master, so what matters here is that window.api offers everything the
// renderer calls and behaves the same way.
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PROJECT = path.join(__dirname, "..");

// Must happen before electron/main.js reads it, so the real clinic data is
// never touched by a test run.
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "easywalk-smoke-"));
app.setPath("userData", SANDBOX);

require(path.join(PROJECT, "electron", "main.js"));

const OUT_DIR = path.join(PROJECT, "test-output");
const results = [];
const consoleErrors = [];

function check(name, pass, detail) {
  results.push({ name, pass: !!pass });
  console.log("  [" + (pass ? "PASS" : "FAIL") + "] " + name + (detail ? "  -> " + detail : ""));
}

function countPdfPages(buffer) {
  const text = buffer.toString("latin1");
  const counts = [];
  const re = /\/Count\s+(\d+)/g;
  let m;
  while ((m = re.exec(text)) !== null) counts.push(Number(m[1]));
  if (counts.length) return Math.max(...counts);
  return (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
}

// Every window.api.* call the shared renderer actually makes. The desktop
// preload has to cover all of them or the app breaks at runtime in a way no
// amount of reading the two files side by side reliably catches.
function apiCallsUsedByRenderer() {
  const used = new Set();
  const walk = dir => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      if (!entry.name.endsWith(".js")) return;
      if (entry.name === "html2pdf.bundle.min.js") return;
      const src = fs.readFileSync(full, "utf-8");
      const re = /window\.api\.([a-zA-Z0-9_]+)/g;
      let m;
      while ((m = re.exec(src)) !== null) used.add(m[1]);
    });
  };
  walk(path.join(PROJECT, "js"));
  return [...used].sort();
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log("\nSandbox userData: " + SANDBOX + "\n");

  // electron/main.js creates the window itself on ready.
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error("electron/main.js did not create a window");
  // Deliberately NOT hidden: a hidden window throttles requestAnimationFrame
  // and compositing, which stalls anything that waits on a frame. It shows for
  // the few seconds the run takes.

  win.webContents.on("console-message", (event, level, message) => {
    if (level >= 2 && message.indexOf("Electron Security Warning") < 0) {
      consoleErrors.push(message);
    }
  });

  if (win.webContents.isLoading()) {
    await new Promise(resolve => win.webContents.once("did-finish-load", resolve));
  }

  const js = code => win.webContents.executeJavaScript(code, true);
  await js('window.confirm = () => true; window.alert = () => {}; "ok"');
  await js('new Promise(r => setTimeout(r, 400))');

  // =====================================================================
  console.log("Platform + API parity");
  // =====================================================================
  const platform = await js('window.api.platform');
  check("preload reports the desktop platform", platform === "desktop", platform);

  const exposed = await js('Object.keys(window.api).sort()');
  const needed = apiCallsUsedByRenderer();
  const missing = needed.filter(name => exposed.indexOf(name) < 0);
  check("preload exposes every window.api method the renderer calls",
    missing.length === 0, missing.length ? "missing: " + missing.join(", ") : needed.length + " methods");

  const desktopOnlyUi = await js([
    '(async () => {',
    '  switchView("settings");',
    '  await loadSettingsView();',
    '  await new Promise(r => setTimeout(r, 200));',
    '  return {',
    '    foldersVisible: !document.getElementById("desktopFoldersCard").hidden,',
    '    installHidden: document.getElementById("installAppBtn").hidden,',
    '    pdfFolder: document.getElementById("pdfFolderPath").value,',
    '    where: document.getElementById("storageWhere").textContent.slice(0, 80)',
    '  };',
    '})()'
  ].join("\n"));
  check("the folder pickers are shown on desktop", desktopOnlyUi.foldersVisible);
  check("the PWA install button stays hidden on desktop", desktopOnlyUi.installHidden);
  check("folder settings load", desktopOnlyUi.pdfFolder.indexOf("not set") >= 0,
    desktopOnlyUi.pdfFolder);
  check("storage wording is the desktop one",
    desktopOnlyUi.where.indexOf("this computer") >= 0, desktopOnlyUi.where);

  // =====================================================================
  console.log("\nShared config + clinic details");
  // =====================================================================
  const addr = await js('CLINIC.addressLines.join(" ")');
  check("new Pathardi Phata address", addr.indexOf("Shivalik Stone") >= 0 && addr.indexOf("422010") >= 0);
  const oldAddr = await js('document.documentElement.innerHTML.indexOf("Prabhu Business") >= 0');
  check("old Wadala address is gone", oldAddr === false);

  // =====================================================================
  console.log("\nNumbering + saving through real IPC");
  // =====================================================================
  const expected = await js('"EW_" + MONTH_NAMES[new Date().getMonth()] + String(new Date().getFullYear()).slice(-2)');

  const numbering = await js([
    '(async () => {',
    '  const peek1 = await window.api.peekDocNumber("EW", { monthStyle: "long" });',
    '  const peek2 = await window.api.peekDocNumber("EW", { monthStyle: "long" });',
    '  const mint1 = await window.api.nextDocNumber("EW", { monthStyle: "long" });',
    '  const mint2 = await window.api.nextDocNumber("EW", { monthStyle: "long" });',
    '  const tp = await window.api.nextDocNumber("TP");',
    '  return { peek1, peek2, mint1, mint2, tp };',
    '})()'
  ].join("\n"));

  check("peeking does not consume a number",
    numbering.peek1 === expected + "_01" && numbering.peek2 === expected + "_01", numbering.peek1);
  check("minting advances the sequence",
    numbering.mint1 === expected + "_01" && numbering.mint2 === expected + "_02",
    numbering.mint1 + ", " + numbering.mint2);
  check("protocols still use the short-month format",
    /^TP_[A-Z][a-z]{2}\d{2}_01$/.test(numbering.tp), numbering.tp);

  const ipd = await js([
    '(async () => {',
    '  const patient = await window.api.savePatient({ name: "Smoke Test", ward: "B-1" });',
    '  await window.api.saveInvoice({ invoiceNumber: "SMOKE_01", invoiceDate: "2026-11-10",',
    '    patientType: "IPD", patientId: patient.id, customer: { name: patient.name },',
    '    items: [], subtotal: 900, cgst: 0, sgst: 0, gstAmount: 0, total: 900, paid: 0,',
    '    balance: 900, createdAt: new Date().toISOString() });',
    '  const link = { patientId: patient.id, docType: "invoice", docNumber: "SMOKE_01",',
    '    date: "2026-11-10", amount: 900 };',
    '  await window.api.linkPatientDocument(link);',
    '  await window.api.linkPatientDocument(link);',
    '  const twice = await window.api.getPatient(patient.id);',
    '  await window.api.linkPatientDocument(Object.assign({}, link, { amount: 1200 }));',
    '  const edited = await window.api.getPatient(patient.id);',
    '  await window.api.deleteInvoice("SMOKE_01");',
    '  const afterDelete = await window.api.getPatient(patient.id);',
    '  const stats = await window.api.getStats();',
    '  return { twiceTotal: twice.billingTotal, twiceRows: twice.linkedDocuments.length,',
    '           editedTotal: edited.billingTotal, deletedTotal: afterDelete.billingTotal,',
    '           deletedRows: afterDelete.linkedDocuments.length, stats };',
    '})()'
  ].join("\n"));

  check("linking the same invoice twice does not double the total", ipd.twiceTotal === 900,
    "total=" + ipd.twiceTotal);
  check("and does not duplicate the row", ipd.twiceRows === 1, "rows=" + ipd.twiceRows);
  check("editing the amount applies the difference only", ipd.editedTotal === 1200,
    "total=" + ipd.editedTotal);
  check("deleting the invoice unlinks and refunds",
    ipd.deletedTotal === 0 && ipd.deletedRows === 0,
    "total=" + ipd.deletedTotal + " rows=" + ipd.deletedRows);
  check("stats report through IPC", ipd.stats.patients === 1 && ipd.stats.invoices === 0,
    JSON.stringify(ipd.stats));

  // =====================================================================
  console.log("\nJSON store durability");
  // =====================================================================
  const dataDir = path.join(SANDBOX, "data");
  check("stores are written as JSON files",
    fs.existsSync(path.join(dataDir, "patients.json")), dataDir);

  const noTempLeft = fs.readdirSync(dataDir).filter(f => f.endsWith(".tmp"));
  check("atomic writes leave no .tmp files behind", noTempLeft.length === 0,
    noTempLeft.join(","));

  // A half-written file must not be read back as "no data" and then overwritten.
  fs.writeFileSync(path.join(dataDir, "patients.json"), '{"broken": ', "utf-8");
  const afterCorrupt = await js('window.api.getPatients()');
  const quarantined = fs.readdirSync(dataDir).filter(f => f.indexOf("patients.json.corrupt-") === 0);
  check("a corrupt store reads back empty rather than throwing",
    Array.isArray(afterCorrupt) && afterCorrupt.length === 0);
  check("and the unreadable file is set aside, not silently overwritten",
    quarantined.length === 1, quarantined.join(","));

  // =====================================================================
  console.log("\nCalendar + pagination (shared renderer)");
  // =====================================================================
  const calendar = await js([
    '(async () => {',
    '  switchView("invoice");',
    '  const row = document.querySelector("#itemsTable tbody tr");',
    '  const opener = row.querySelector(".pick-dates-btn");',
    '  opener.scrollIntoView({ block: "center" });',
    '  await new Promise(r => setTimeout(r, 120));',
    '  opener.click();',
    '  await new Promise(r => setTimeout(r, 80));',
    '  const grid = document.querySelector(".dp-grid");',
    '  const cells = [...grid.querySelectorAll(".dp-day")];',
    '  const ym = todayIso().slice(0, 8);',
    '  const at = d => cells.find(c => c.dataset.date === ym + d);',
    '  const ev = (type, el) => { const r = el.getBoundingClientRect();',
    '    return new PointerEvent(type, { bubbles: true, pointerId: 1, isPrimary: true,',
    '      pointerType: "mouse", clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }); };',
    '  const a = at("05"), b = at("09");',
    '  a.dispatchEvent(ev("pointerdown", a));',
    '  grid.dispatchEvent(ev("pointermove", b));',
    '  window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));',
    '  const selected = document.querySelectorAll(".dp-day.dp-sel").length;',
    '  closeDatePicker();',
    '  return { selected, chips: row.querySelectorAll(".date-chip").length,',
    '           sessions: row.querySelector(".qty").value };',
    '})()'
  ].join("\n"));

  check("dragging across the calendar selects a span", calendar.selected === 5,
    "selected=" + calendar.selected);
  check("the span collapses into one chip", calendar.chips === 1, "chips=" + calendar.chips);
  check("sessions follow the dates", calendar.sessions === "5", calendar.sessions);

  const pagination = await js([
    '(async () => {',
    '  switchView("protocol");',
    '  renderProtocolPreview({ docNumber: "TP_Nov26_99", patientName: "Paginate", age: "40",',
    '    gender: "Male", address: "Nashik", diagnosis: "Test", assessmentDate: "2026-11-10",',
    '    physio: "Dr. S", signBy: "Dr. S", designation: "Physiotherapist",',
    '    exercises: Array.from({ length: 60 }, (_, i) => "Exercise " + (i + 1) + " - " + "instruction ".repeat(8)) });',
    '  await new Promise(r => setTimeout(r, 100));',
    '  const preview = document.getElementById("protocol-preview");',
    '  return { pages: preview.querySelectorAll(".doc-page").length,',
    '           items: preview.querySelectorAll(".protocol-item").length };',
    '})()'
  ].join("\n"));
  check("long protocols paginate by measurement", pagination.pages > 1, "pages=" + pagination.pages);
  check("no exercise is dropped", pagination.items === 60, "items=" + pagination.items);

  // =====================================================================
  console.log("\nPrinting");
  // =====================================================================
  async function printPages(label, setup) {
    await js(setup);
    const buffer = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
    fs.writeFileSync(path.join(OUT_DIR, label + ".pdf"), buffer);
    await js('window.__restorePrint && window.__restorePrint(); "restored"');
    return countPdfPages(buffer);
  }

  const invoicePages = await printPages("desktop-print-invoice", [
    'switchView("invoice");',
    'populatePreview({ invoiceNumber: "SMOKE_01", invoiceDate: "2026-11-10",',
    '  customer: { name: "Smoke Test", phone: "9800000000" }, treatment: "Test",',
    '  items: [{ dates: [{ type: "single", date: "2026-11-05" }], duration: "1hr",',
    '    quantity: 1, rate: 500, amount: 500 }],',
    '  subtotal: 500, cgst: 0, sgst: 0, gstAmount: 0, total: 500, paid: 0, balance: 500 });',
    'window.__restorePrint = beginPrintLayout(document.getElementById("invoice-preview"), "invoice");',
    '"ok"'
  ].join("\n"));
  check("an invoice prints as exactly 1 page, no trailing blank", invoicePages === 1,
    "pages=" + invoicePages);

  const protocolPages = await printPages("desktop-print-protocol", [
    'switchView("protocol");',
    'window.__restorePrint = beginPrintLayout(document.getElementById("protocol-preview"), "protocol");',
    '"ok"'
  ].join("\n"));
  check("the protocol prints the same number of sheets as it has pages",
    protocolPages === pagination.pages, "printed=" + protocolPages + " dom=" + pagination.pages);

  const restored = await js([
    '({ rootEmpty: document.getElementById("print-root").children.length === 0,',
    '   bodyClean: !document.body.classList.contains("printing") })'
  ].join("\n"));
  check("the page is restored after printing", restored.rootEmpty && restored.bodyClean);

  // =====================================================================
  console.log("\nPDF + backup to disk");
  // =====================================================================
  const pdfPath = await js([
    '(async () => {',
    '  switchView("invoice");',
    '  return generateInvoicePdf({ invoiceNumber: "SMOKE_01",',
    '    customer: { name: "Smoke Test" } });',
    '})()'
  ].join("\n"));
  check("the PDF is written to the app data folder",
    typeof pdfPath === "string" && fs.existsSync(pdfPath), pdfPath);

  const backupPath = await js('window.api.exportBackup()');
  check("the backup is written to disk", fs.existsSync(backupPath), backupPath);
  if (fs.existsSync(backupPath)) {
    const snapshot = JSON.parse(fs.readFileSync(backupPath, "utf-8"));
    check("the backup carries settings as well as records",
      snapshot.settings !== undefined && snapshot.counters !== undefined &&
      Array.isArray(snapshot.invoices),
      "keys=" + Object.keys(snapshot).join(","));
  }

  check("no uncaught console errors", consoleErrors.length === 0,
    consoleErrors.slice(0, 2).join(" | "));

  // =====================================================================
  const failed = results.filter(r => !r.pass);
  console.log("\n" + "=".repeat(68));
  console.log(results.length - failed.length + " passed, " + failed.length + " failed");
  if (failed.length) {
    console.log("\nFailures:");
    failed.forEach(f => console.log("  - " + f.name));
  }
  console.log("=".repeat(68) + "\n");

  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (ignored) { /* best effort */ }
  app.exit(failed.length ? 1 : 0);
}

app.whenReady().then(() => {
  // Give electron/main.js's own whenReady handler a moment to create the window.
  setTimeout(() => {
    main().catch(err => {
      console.error("\nSMOKE ERROR:", err);
      app.exit(2);
    });
  }, 800);
});
