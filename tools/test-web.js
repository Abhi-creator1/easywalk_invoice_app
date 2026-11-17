// Headless test harness for the web app.
//
// Runs with:  npm test
//
// Electron is used purely as a scriptable Chromium: the window loads the app
// over http from tools/serve.js with no preload, so window.api comes from
// js/platform/api.web.js and the real browser code path is what gets tested --
// IndexedDB, layout, the print stylesheet and all.
//
// printToPDF is the important one: it renders through the print stylesheet, so
// counting pages in the result is a direct check on the trailing-blank-page bug.
const { app, BrowserWindow, session } = require("electron");
const fs = require("fs");
const path = require("path");
const serve = require("./serve");

const OUT_DIR = path.join(__dirname, "..", "test-output");

const results = [];
const consoleErrors = [];

function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail === undefined ? "" : String(detail) });
  const mark = pass ? "PASS" : "FAIL";
  console.log("  [" + mark + "] " + name + (detail ? "  -> " + detail : ""));
}

function countPdfPages(buffer) {
  const text = buffer.toString("latin1");
  const typePages = (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
  const counts = [];
  const re = /\/Count\s+(\d+)/g;
  let m;
  while ((m = re.exec(text)) !== null) counts.push(Number(m[1]));
  return counts.length ? Math.max(...counts) : typePages;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const { server, port } = await serve.start(0);
  const base = "http://127.0.0.1:" + port + "/";
  console.log("\nServing " + base + "\n");

  // PDF downloads must not pop a save dialog and stall the run.
  const downloads = [];
  session.defaultSession.on("will-download", (event, item) => {
    const target = path.join(OUT_DIR, item.getFilename());
    item.setSavePath(target);
    downloads.push(item.getFilename());
  });

  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });

  win.webContents.on("console-message", (event, level, message) => {
    // Electron emits its own development-time security warnings into the
    // renderer console; those are not errors coming from the app.
    if (level >= 2 && message.indexOf("Electron Security Warning") < 0) {
      consoleErrors.push(message);
    }
  });

  await win.loadURL(base);

  const js = code => win.webContents.executeJavaScript(code, true);

  // Native dialogs would block a headless run.
  await js('window.confirm = () => true; window.alert = () => {}; "ok"');
  await js('new Promise(r => setTimeout(r, 400))');

  // =====================================================================
  console.log("Platform + storage");
  // =====================================================================
  const platform = await js('({ api: typeof window.api, platform: window.api && window.api.platform, db: typeof db })');
  check("window.api installed by the web shim", platform.api === "object" && platform.platform === "web",
    "platform=" + platform.platform);
  check("db facade present", platform.db === "object");

  const addr = await js('CLINIC.addressLines.join(" ")');
  check("new Pathardi Phata address is in the clinic config",
    addr.indexOf("Shivalik Stone") >= 0 && addr.indexOf("422010") >= 0, addr);

  const oldAddr = await js('document.documentElement.innerHTML.indexOf("Prabhu Business") >= 0');
  check("old Wadala address no longer anywhere in the page", oldAddr === false);

  const footer = await js('document.getElementById("p-invoiceFooter").textContent.replace(/\\s+/g, " ").trim()');
  check("invoice footer rendered from the shared config",
    footer.indexOf("Shivalik Stone") >= 0 && footer.indexOf("KFJPS7319J") >= 0, footer.slice(0, 80) + "...");

  // =====================================================================
  console.log("\nDate helpers");
  // =====================================================================
  const helpers = await js([
    'JSON.parse(JSON.stringify({',
    '  collapse: datesToEntries(["2025-11-03","2025-11-04","2025-11-05","2025-11-09"]),',
    '  wholeMonth: formatRangeLabel("2025-11-01","2025-11-30"),',
    '  partial: formatRangeLabel("2025-11-03","2025-11-09"),',
    '  roundTrip: [...entriesToDates(datesToEntries(["2025-11-01","2025-11-02"]))],',
    '  manual: { ok: [...parseManualDates("3/11/25, 7/11/2025, 10/11/25 - 12/11/25").dates],',
    '            bad: parseManualDates("31/02/25, hello").errors },',
    '  dashDates: [...parseManualDates("3-11-25").dates],',
    '  legacyString: countEntryDates(["2025-11-01"])',
    '}))'
  ].join("\n"));

  check("consecutive dates collapse into a range entry",
    helpers.collapse.length === 2 && helpers.collapse[0].type === "range" &&
    helpers.collapse[0].from === "2025-11-03" && helpers.collapse[0].to === "2025-11-05" &&
    helpers.collapse[1].type === "single",
    JSON.stringify(helpers.collapse));
  check("a whole calendar month still labels as 'November 2025'",
    helpers.wholeMonth === "November 2025", helpers.wholeMonth);
  check("a partial span labels as dd/mm/yy - dd/mm/yy",
    helpers.partial === "03/11/25 - 09/11/25", helpers.partial);
  check("entries round-trip back to the same dates",
    helpers.roundTrip.join(",") === "2025-11-01,2025-11-02", helpers.roundTrip.join(","));
  check("manual entry parses singles and ranges",
    helpers.manual.ok.length === 5 && helpers.manual.ok.indexOf("2025-11-11") >= 0,
    helpers.manual.ok.join(","));
  check("manual entry reports unreadable tokens", helpers.manual.bad.length === 2,
    JSON.stringify(helpers.manual.bad));
  check("dash-separated dates parse (3-11-25)",
    helpers.dashDates.length === 1 && helpers.dashDates[0] === "2025-11-03",
    helpers.dashDates.join(","));
  check("legacy string date entries do not crash", helpers.legacyString === 1);

  // =====================================================================
  console.log("\nCalendar: tap, drag, shift-tap");
  // =====================================================================
  const drag = await js([
    '(async () => {',
    '  const row = document.querySelector("#itemsTable tbody tr");',
    '  row.querySelector(".pick-dates-btn").click();',
    '  await new Promise(r => requestAnimationFrame(r));',
    '  const grid = document.querySelector(".dp-grid");',
    '  const cells = [...grid.querySelectorAll(".dp-day")];',
    '  // The calendar opens on the current month, so days are addressed relative',
    '  // to it rather than by a hardcoded date.',
    '  const ym = todayIso().slice(0, 8);',
    '  const at = day => cells.find(c => c.dataset.date === ym + day);',
    '  const centre = el => { const r = el.getBoundingClientRect();',
    '    return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }; };',
    '  const ev = (type, el, extra) => new PointerEvent(type, Object.assign(',
    '    { bubbles: true, pointerId: 1, isPrimary: true, pointerType: "mouse" }, centre(el), extra || {}));',
    '',
    '  // single tap',
    '  const d3 = at("03");',
    '  d3.dispatchEvent(ev("pointerdown", d3));',
    '  window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));',
    '  const afterTap = document.querySelectorAll(".dp-day.dp-sel").length;',
    '',
    '  // drag 10 -> 14',
    '  const d10 = at("10"), d14 = at("14");',
    '  d10.dispatchEvent(ev("pointerdown", d10));',
    '  grid.dispatchEvent(ev("pointermove", d14));',
    '  window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));',
    '  const afterDrag = document.querySelectorAll(".dp-day.dp-sel").length;',
    '',
    '  // shift-tap from 14 out to 16',
    '  const d16 = at("16");',
    '  d16.dispatchEvent(ev("pointerdown", d16, { shiftKey: true }));',
    '  window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));',
    '  const afterShift = document.querySelectorAll(".dp-day.dp-sel").length;',
    '',
    '  const banding = {',
    '    start: !!document.querySelector(".dp-day.dp-start"),',
    '    mid: !!document.querySelector(".dp-day.dp-mid"),',
    '    end: !!document.querySelector(".dp-day.dp-end")',
    '  };',
    '',
    '  // drag back over a selected span to clear it',
    '  const d11 = at("11"), d13 = at("13");',
    '  d11.dispatchEvent(ev("pointerdown", d11));',
    '  grid.dispatchEvent(ev("pointermove", d13));',
    '  window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));',
    '  const afterErase = document.querySelectorAll(".dp-day.dp-sel").length;',
    '',
    '  const count = document.querySelector(".dp-count").textContent;',
    '  closeDatePicker();',
    '  const chips = [...row.querySelectorAll(".date-chip")].map(c => c.textContent.replace("\\u2715", "").trim());',
    '  const sessions = row.querySelector(".qty").value;',
    '  return { afterTap, afterDrag, afterShift, afterErase, banding, count, chips, sessions };',
    '})()'
  ].join("\n"));

  check("tapping one day selects exactly it", drag.afterTap === 1, "selected=" + drag.afterTap);
  check("dragging 10->14 adds a 5-day span", drag.afterDrag === 6, "selected=" + drag.afterDrag);
  check("shift-tap extends the span to 16", drag.afterShift === 8, "selected=" + drag.afterShift);
  check("a span renders as one connected band",
    drag.banding.start && drag.banding.mid && drag.banding.end, JSON.stringify(drag.banding));
  check("dragging back over selected days clears them", drag.afterErase === 5,
    "selected=" + drag.afterErase);
  check("live count reflects the selection", /5 dates selected/.test(drag.count), drag.count);
  check("chips collapse the selection (single + range)", drag.chips.length === 3,
    JSON.stringify(drag.chips));
  check("No. of Sessions auto-fills from the dates picked", drag.sessions === "5",
    "sessions=" + drag.sessions);

  // =====================================================================
  console.log("\nManual entry through the row input");
  // =====================================================================
  const manualRow = await js([
    '(async () => {',
    '  const row = document.querySelector("#itemsTable tbody tr");',
    '  const input = row.querySelector(".date-manual");',
    '  input.value = "20/11/25, 22/11/25 - 24/11/25";',
    '  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));',
    '  await new Promise(r => setTimeout(r, 50));',
    '  const chips = [...row.querySelectorAll(".date-chip")].length;',
    '  input.value = "nonsense";',
    '  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));',
    '  await new Promise(r => setTimeout(r, 50));',
    '  const err = row.querySelector(".date-manual-error");',
    '  return { chips, sessions: row.querySelector(".qty").value,',
    '           errorShown: !err.hidden, errorText: err.textContent };',
    '})()'
  ].join("\n"));

  check("typed dates merge into the same selection", manualRow.chips === 5,
    "chips=" + manualRow.chips);
  check("sessions follow the merged total", manualRow.sessions === "9",
    "sessions=" + manualRow.sessions);
  check("unreadable manual input is reported inline", manualRow.errorShown,
    manualRow.errorText);

  // =====================================================================
  console.log("\nInvoice numbering + saving");
  // =====================================================================
  const expectedPrefix = await js('"EW_" + MONTH_NAMES[new Date().getMonth()] + String(new Date().getFullYear()).slice(-2)');

  const suggested = await js('document.getElementById("invoiceNumber").value');
  check("invoice number is suggested with a sequence",
    suggested === expectedPrefix + "_01", suggested);

  const peekTwice = await js('window.api.peekDocNumber("EW", { monthStyle: "long" })');
  check("peeking does not consume the number", peekTwice === expectedPrefix + "_01", peekTwice);

  const firstSave = await js([
    '(async () => {',
    '  document.getElementById("customerName").value = "Asha Patil";',
    '  document.getElementById("customerAge").value = "54";',
    '  document.getElementById("customerPhone").value = "9800000000";',
    '  document.getElementById("treatment").value = "Post-op knee rehabilitation";',
    '  const row = document.querySelector("#itemsTable tbody tr");',
    '  row.querySelector(".duration").value = "45min";',
    '  row.querySelector(".rate").value = "500";',
    '  row.querySelector(".rate").dispatchEvent(new Event("input", { bubbles: true }));',
    '  document.getElementById("cgst").value = "9";',
    '  document.getElementById("sgst").value = "9";',
    '  document.getElementById("paidAmount").value = "2000";',
    '  document.getElementById("cgst").dispatchEvent(new Event("input", { bubbles: true }));',
    '  document.getElementById("invoice-form").dispatchEvent(new Event("submit", { cancelable: true }));',
    '  await new Promise(r => setTimeout(r, 2500));',
    '  const stored = await window.api.getInvoices();',
    '  return {',
    '    count: stored.length,',
    '    number: stored[0] && stored[0].invoiceNumber,',
    '    subtotal: stored[0] && stored[0].subtotal,',
    '    total: stored[0] && stored[0].total,',
    '    balance: stored[0] && stored[0].balance,',
    '    sessions: stored[0] && stored[0].items[0].quantity,',
    '    dateEntries: stored[0] && stored[0].items[0].dates.length,',
    '    previewTotal: document.getElementById("p-total").textContent,',
    '    previewRows: document.getElementById("p-items").children.length,',
    '    nextSuggested: document.getElementById("invoiceNumber").value',
    '  };',
    '})()'
  ].join("\n"));

  check("invoice saved to IndexedDB", firstSave.count === 1, "count=" + firstSave.count);
  check("saved under the sequenced number", firstSave.number === expectedPrefix + "_01",
    firstSave.number);
  check("subtotal = 9 sessions x 500", firstSave.subtotal === 4500, "subtotal=" + firstSave.subtotal);
  check("total adds 18% GST", Math.abs(firstSave.total - 5310) < 0.01, "total=" + firstSave.total);
  check("balance subtracts the paid amount", Math.abs(firstSave.balance - 3310) < 0.01,
    "balance=" + firstSave.balance);
  check("the printed invoice now has a Total line",
    firstSave.previewTotal.indexOf("5310") >= 0, "p-total=" + firstSave.previewTotal);
  check("preview lists the line item", firstSave.previewRows === 1);
  check("next invoice number advances to _02",
    firstSave.nextSuggested === expectedPrefix + "_02", firstSave.nextSuggested);

  const secondSave = await js([
    '(async () => {',
    '  document.getElementById("invoiceClearBtn").click();',
    '  await new Promise(r => setTimeout(r, 300));',
    '  document.getElementById("customerName").value = "Ravi Kulkarni";',
    '  const row = document.querySelector("#itemsTable tbody tr");',
    '  row.querySelector(".rate").value = "300";',
    '  row.querySelector(".qty").value = "4";',
    '  row.querySelector(".qty").dispatchEvent(new Event("input", { bubbles: true }));',
    '  document.getElementById("invoice-form").dispatchEvent(new Event("submit", { cancelable: true }));',
    '  await new Promise(r => setTimeout(r, 2500));',
    '  const stored = await window.api.getInvoices();',
    '  return { count: stored.length, numbers: stored.map(i => i.invoiceNumber).sort() };',
    '})()'
  ].join("\n"));

  check("a second invoice in the same month does NOT overwrite the first",
    secondSave.count === 2, "count=" + secondSave.count);
  check("both invoices are numbered _01 and _02",
    secondSave.numbers.join(",") === expectedPrefix + "_01," + expectedPrefix + "_02",
    secondSave.numbers.join(","));

  // =====================================================================
  console.log("\nIPD patient linking (no double counting)");
  // =====================================================================
  const ipd = await js([
    '(async () => {',
    '  const patient = await window.api.savePatient({ name: "O\'Brien <b>Test</b>", age: "61",',
    '    gender: "Female", ward: "A-2", diagnosis: "Hemiplegia", physio: "Dr. S" });',
    '  await loadPatients();',
    '',
    '  const invoice = { invoiceNumber: "IPD_TEST_01", invoiceDate: "2025-11-10",',
    '    patientType: "IPD", patientId: patient.id, customer: { name: patient.name },',
    '    items: [], subtotal: 1000, cgst: 0, sgst: 0, gstAmount: 0, total: 1000,',
    '    paid: 0, balance: 1000, createdAt: new Date().toISOString() };',
    '  await window.api.saveInvoice(invoice);',
    '  const link = { patientId: patient.id, docType: "invoice", docNumber: "IPD_TEST_01",',
    '    date: "2025-11-10", amount: 1000 };',
    '  await window.api.linkPatientDocument(link);',
    '  await window.api.linkPatientDocument(link);',
    '  const afterTwice = await window.api.getPatient(patient.id);',
    '',
    '  await window.api.linkPatientDocument(Object.assign({}, link, { amount: 1500 }));',
    '  const afterEdit = await window.api.getPatient(patient.id);',
    '',
    '  await window.api.deleteInvoice("IPD_TEST_01");',
    '  const afterDelete = await window.api.getPatient(patient.id);',
    '',
    '  await loadPatients();',
    '  const option = document.querySelector("#invoicePatientSelect option[value=\\"" + patient.id + "\\"]");',
    '  const nameCell = document.querySelector("#patientListTable tbody tr td");',
    '  return {',
    '    twiceTotal: afterTwice.billingTotal, twiceRows: afterTwice.linkedDocuments.length,',
    '    editTotal: afterEdit.billingTotal, editRows: afterEdit.linkedDocuments.length,',
    '    deleteTotal: afterDelete.billingTotal, deleteRows: afterDelete.linkedDocuments.length,',
    '    optionText: option && option.textContent, optionFound: !!option,',
    '    listName: nameCell && nameCell.textContent,',
    '    listHtmlInjected: !!(nameCell && nameCell.querySelector("b"))',
    '  };',
    '})()'
  ].join("\n"));

  check("saving the same invoice twice does not double the billing total",
    ipd.twiceTotal === 1000, "billingTotal=" + ipd.twiceTotal);
  check("and does not duplicate the linked-document row", ipd.twiceRows === 1,
    "rows=" + ipd.twiceRows);
  check("editing the amount applies only the difference", ipd.editTotal === 1500,
    "billingTotal=" + ipd.editTotal);
  check("deleting the invoice unlinks it and refunds the total",
    ipd.deleteTotal === 0 && ipd.deleteRows === 0,
    "total=" + ipd.deleteTotal + " rows=" + ipd.deleteRows);
  check("a name with an apostrophe still builds a valid dropdown option",
    ipd.optionFound && ipd.optionText.indexOf("O'Brien") >= 0, ipd.optionText);
  check("markup in a patient name is escaped, not rendered",
    ipd.listHtmlInjected === false && ipd.listName.indexOf("<b>") >= 0, ipd.listName);

  // =====================================================================
  console.log("\nPagination by measurement");
  // =====================================================================
  const pagination = await js([
    '(async () => {',
    '  const long = [];',
    '  for (let i = 1; i <= 60; i++) {',
    '    long.push("Exercise " + i + " - " + "repeated instruction text ".repeat(4));',
    '  }',
    '  renderProtocolPreview({ docNumber: "TP_Nov25_99", patientName: "Paginate Test",',
    '    age: "40", gender: "Male", address: "Nashik", diagnosis: "Test",',
    '    assessmentDate: "2025-11-10", physio: "Dr. S", signBy: "Dr. S",',
    '    designation: "Physiotherapist", exercises: long });',
    '  await new Promise(r => setTimeout(r, 100));',
    '',
    '  const preview = document.getElementById("protocol-preview");',
    '  const pages = [...preview.querySelectorAll(".doc-page")];',
    '  const items = preview.querySelectorAll(".protocol-item").length;',
    '  const probe = document.createElement("div");',
    '  probe.style.cssText = "position:absolute;visibility:hidden;height:296mm;";',
    '  document.body.appendChild(probe);',
    '  const limit = probe.offsetHeight;',
    '  probe.remove();',
    '  const overflowing = pages.filter(p => p.scrollHeight > limit + 2).length;',
    '  const firstHeaders = preview.querySelectorAll(".doc-header-first").length;',
    '  const contHeaders = preview.querySelectorAll(".doc-header-continuation").length;',
    '  const hasSign = !!preview.querySelector(".sign-stamp-block");',
    '  return { pages: pages.length, items, overflowing, firstHeaders, contHeaders, hasSign, limit };',
    '})()'
  ].join("\n"));

  check("60 long exercises spill onto multiple pages", pagination.pages > 1,
    "pages=" + pagination.pages);
  check("no exercise is dropped during pagination", pagination.items === 60,
    "items=" + pagination.items);
  check("no page overflows its sheet", pagination.overflowing === 0,
    "overflowing=" + pagination.overflowing);
  check("only page 1 carries the branded header", pagination.firstHeaders === 1,
    "banner=" + pagination.firstHeaders + " continuation=" + pagination.contHeaders);
  check("the sign & stamp block survives to the last page", pagination.hasSign);

  const longCert = await js([
    '(async () => {',
    '  const paragraphs = [];',
    '  for (let i = 1; i <= 40; i++) {',
    '    paragraphs.push("Paragraph " + i + ". " + "This certificate text is deliberately long. ".repeat(6));',
    '  }',
    '  renderCertificatePreview({ docNumber: "CERT_Nov25_99", certType: "Fitness",',
    '    patientName: "Long Body", age: "33", gender: "Male", diagnosis: "Test",',
    '    date: "2025-11-11", body: paragraphs.join("\\n\\n"), signBy: "Dr. S",',
    '    designation: "Physiotherapist" });',
    '  await new Promise(r => setTimeout(r, 100));',
    '  const preview = document.getElementById("certificate-preview");',
    '  return { pages: preview.querySelectorAll(".doc-page").length,',
    '           paragraphs: preview.querySelectorAll(".cert-body").length,',
    '           lastParagraphPresent: preview.textContent.indexOf("Paragraph 40.") >= 0 };',
    '})()'
  ].join("\n"));

  check("a long certificate body flows across pages instead of being cut off",
    longCert.pages > 1, "pages=" + longCert.pages);
  check("every paragraph is rendered", longCert.paragraphs === 40,
    "paragraphs=" + longCert.paragraphs);
  check("the final paragraph is not lost", longCert.lastParagraphPresent);

  // =====================================================================
  console.log("\nPrinting: page counts (the blank-page bug)");
  // =====================================================================
  async function printPages(label, setup) {
    await js(setup);
    const buffer = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true
    });
    fs.writeFileSync(path.join(OUT_DIR, label + ".pdf"), buffer);
    await js('window.__restorePrint && window.__restorePrint(); "restored"');
    return countPdfPages(buffer);
  }

  const invoicePages = await printPages("print-invoice", [
    'const el = document.getElementById("invoice-preview");',
    'el.style.display = "flex";',
    'window.__restorePrint = beginPrintLayout(el, "invoice");',
    '"ok"'
  ].join("\n"));
  check("printing an invoice produces exactly 1 page (was 2-3 with a blank)",
    invoicePages === 1, "pages=" + invoicePages);

  const protocolDomPages = pagination.pages;
  const protocolPrinted = await printPages("print-protocol", [
    'renderProtocolPreview({ docNumber: "TP_Nov25_99", patientName: "Paginate Test",',
    '  age: "40", gender: "Male", address: "Nashik", diagnosis: "Test",',
    '  assessmentDate: "2025-11-10", physio: "Dr. S", signBy: "Dr. S",',
    '  designation: "Physiotherapist",',
    '  exercises: Array.from({ length: 60 }, (_, i) => "Exercise " + (i + 1) + " - " + "repeated instruction text ".repeat(4)) });',
    'window.__restorePrint = beginPrintLayout(document.getElementById("protocol-preview"), "protocol");',
    '"ok"'
  ].join("\n"));
  check("a paginated protocol prints exactly as many sheets as it has pages",
    protocolPrinted === protocolDomPages,
    "printed=" + protocolPrinted + " dom=" + protocolDomPages);

  const singlePageProtocol = await printPages("print-protocol-short", [
    'renderProtocolPreview({ docNumber: "TP_Nov25_98", patientName: "Short", age: "30",',
    '  gender: "Male", address: "Nashik", diagnosis: "Test", assessmentDate: "2025-11-10",',
    '  physio: "Dr. S", signBy: "Dr. S", designation: "Physiotherapist",',
    '  exercises: ["Knee extension", "Quad sets", "Heel slides"] });',
    'window.__restorePrint = beginPrintLayout(document.getElementById("protocol-preview"), "protocol");',
    '"ok"'
  ].join("\n"));
  check("a short protocol prints 1 page with no trailing blank",
    singlePageProtocol === 1, "pages=" + singlePageProtocol);

  const additionalPrinted = await printPages("print-additional", [
    'renderAdditionalPreview({ name: "Referral Letter",',
    '  content: "Dear Doctor,\\n\\nPlease see this patient.\\n\\nRegards.",',
    '  signBy: "Dr. S", designation: "Proprietor" });',
    'window.__restorePrint = beginPrintLayout(document.getElementById("additional-preview"), "additional");',
    '"ok"'
  ].join("\n"));
  check("an additional document prints 1 page", additionalPrinted === 1,
    "pages=" + additionalPrinted);

  const restoredCleanly = await js([
    '({ printRootEmpty: document.getElementById("print-root").children.length === 0,',
    '   bodyClean: !document.body.classList.contains("printing"),',
    '   previewBack: !!document.querySelector(".preview-scroll #invoice-preview"),',
    '   placeholders: document.querySelectorAll(".print-placeholder").length })'
  ].join("\n"));
  check("the page is restored after printing",
    restoredCleanly.printRootEmpty && restoredCleanly.bodyClean &&
    restoredCleanly.previewBack && restoredCleanly.placeholders === 0,
    JSON.stringify(restoredCleanly));

  // =====================================================================
  console.log("\nPDF export + backup");
  // =====================================================================
  const exported = await js([
    '(async () => {',
    '  const invoices = await window.api.getInvoices();',
    '  const name = await generateInvoicePdf(invoices[0]);',
    '  return name;',
    '})()'
  ].join("\n"));
  await new Promise(r => setTimeout(r, 1500));
  check("an invoice PDF is generated and handed to the browser to download",
    typeof exported === "string" && exported.endsWith(".pdf"), exported);

  const scale = await js('pdfCanvasScale()');
  check("html2canvas scale lowered from 3 (memory fix for the 4GB PC)",
    scale <= 2, "scale=" + scale);

  const backup = await js([
    '(async () => {',
    '  const name = await window.api.exportBackup();',
    '  return name;',
    '})()'
  ].join("\n"));
  await new Promise(r => setTimeout(r, 1200));
  check("backup export produces a file", typeof backup === "string" && backup.endsWith(".json"),
    backup);

  const backupFile = downloads.find(f => f.indexOf("easywalk-backup") === 0);
  if (backupFile) {
    const snapshot = JSON.parse(fs.readFileSync(path.join(OUT_DIR, backupFile), "utf-8"));
    check("backup includes invoices, documents, patients AND settings",
      Array.isArray(snapshot.invoices) && Array.isArray(snapshot.documents) &&
      Array.isArray(snapshot.patients) && snapshot.settings !== undefined &&
      snapshot.counters !== undefined,
      "keys=" + Object.keys(snapshot).join(","));
  } else {
    check("backup file written to disk", false, "no backup file in downloads");
  }

  // =====================================================================
  console.log("\nResilience + PWA");
  // =====================================================================
  const legacy = await js([
    '(async () => {',
    '  await window.api.saveInvoice({ invoiceNumber: "LEGACY_01", invoiceDate: "2024-03-01",',
    '    customer: { name: "Old Record" }, items: [{ dates: "01/03/24", duration: "1hr",',
    '    quantity: 1, rate: 100, amount: 100 }] });',
    '  await loadInvoiceHistory();',
    '  const rows = document.querySelectorAll("#historyTable tbody tr").length;',
    '  const legacyRow = [...document.querySelectorAll("#historyTable tbody tr")]',
    '    .find(tr => tr.textContent.indexOf("LEGACY_01") >= 0);',
    '  legacyRow.querySelector("button[data-act=view]").click();',
    '  await new Promise(r => setTimeout(r, 200));',
    '  return { rows, previewed: document.getElementById("p-items").children.length,',
    '           totalCell: legacyRow.children[3].textContent };',
    '})()'
  ].join("\n"));
  check("a record with no total and a string date still renders the history table",
    legacy.rows === 3, "rows=" + legacy.rows);
  check("missing total shows as 0.00 instead of throwing",
    legacy.totalCell.indexOf("0.00") >= 0, legacy.totalCell);
  check("viewing a legacy record does not crash the preview", legacy.previewed === 1);

  const sw = await js([
    '(async () => {',
    '  const reg = await navigator.serviceWorker.getRegistration();',
    '  const manifest = await fetch("manifest.json").then(r => r.json());',
    '  return { registered: !!reg, controller: !!navigator.serviceWorker.controller,',
    '           scope: reg && reg.scope, start: manifest.start_url, manifestScope: manifest.scope };',
    '})()'
  ].join("\n"));
  check("service worker registers (offline mode)", sw.registered, "scope=" + sw.scope);
  check("manifest uses relative start_url/scope for a Pages subfolder",
    sw.start === "./" && sw.manifestScope === "./",
    "start=" + sw.start + " scope=" + sw.manifestScope);

  const stats = await js('window.api.getStats()');
  check("settings view can report record counts",
    stats.invoices === 3 && stats.patients === 1,
    "invoices=" + stats.invoices + " documents=" + stats.documents + " patients=" + stats.patients);

  // =====================================================================
  console.log("\nMobile layout");
  // =====================================================================
  win.setSize(390, 844);
  await js('window.dispatchEvent(new Event("resize")); new Promise(r => setTimeout(r, 400))');
  const mobile = await js([
    '(async () => {',
    '  switchView("invoice");',
    '  populatePreview((await window.api.getInvoices())[0]);',
    '  window.dispatchEvent(new Event("resize"));',
    '  await new Promise(r => setTimeout(r, 300));',
    '  const wrapper = document.querySelector(".preview-scroll");',
    '  const zoom = wrapper.style.getPropertyValue("--preview-zoom");',
    '  const row = document.querySelector(".row");',
    '  const stacked = getComputedStyle(row).flexDirection;',
    '  return { fit: wrapper.classList.contains("fit"), zoom,',
    '           stacked, bodyOverflow: document.body.scrollWidth <= window.innerWidth + 1,',
    '           navScrolls: getComputedStyle(document.querySelector(".app-nav")).overflowX };',
    '})()'
  ].join("\n"));

  check("previews are zoomed to fit a phone screen",
    mobile.fit && Number(mobile.zoom) > 0 && Number(mobile.zoom) < 1, "zoom=" + mobile.zoom);
  check("paired fields stack on a phone", mobile.stacked === "column", mobile.stacked);
  check("the page does not scroll sideways on a phone", mobile.bodyOverflow);
  check("the nav scrolls horizontally instead of wrapping",
    mobile.navScrolls === "auto" || mobile.navScrolls === "scroll", mobile.navScrolls);

  const sheet = await js([
    '(async () => {',
    '  document.querySelector("#itemsTable tbody tr .pick-dates-btn").click();',
    '  await new Promise(r => requestAnimationFrame(r));',
    '  const pop = document.querySelector(".dp-pop");',
    '  const isSheet = pop.classList.contains("dp-sheet");',
    '  const dayHeight = document.querySelector(".dp-day").getBoundingClientRect().height;',
    '  const fitsWidth = pop.getBoundingClientRect().width <= window.innerWidth;',
    '  closeDatePicker();',
    '  return { isSheet, dayHeight, fitsWidth };',
    '})()'
  ].join("\n"));
  check("the calendar becomes a bottom sheet on a phone", sheet.isSheet);
  check("day targets are at least 40px tall for thumbs", sheet.dayHeight >= 40,
    "height=" + sheet.dayHeight.toFixed(1));
  check("the calendar fits the screen width", sheet.fitsWidth);

  // =====================================================================
  // Screenshots for a visual look
  // =====================================================================
  win.setSize(1280, 900);
  await js('window.dispatchEvent(new Event("resize")); new Promise(r => setTimeout(r, 400))');

  async function shot(name, setup) {
    if (setup) await js(setup);
    await new Promise(r => setTimeout(r, 450));
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT_DIR, name + ".png"), image.toPNG());
  }

  await shot("01-invoice-form", 'switchView("invoice"); window.scrollTo(0,0); "ok"');
  await shot("02-calendar", [
    'switchView("invoice");',
    'document.querySelector("#itemsTable tbody tr .pick-dates-btn").scrollIntoView({block:"center"});',
    'document.querySelector("#itemsTable tbody tr .pick-dates-btn").click(); "ok"'
  ].join("\n"));
  await shot("03-invoice-preview", [
    '(async () => {',
    '  closeDatePicker();',
    '  const invoices = await window.api.getInvoices();',
    '  populatePreview(invoices.find(i => i.customer.name === "Asha Patil"));',
    '  document.getElementById("invoice-preview").scrollIntoView({ block: "start" });',
    '  return "ok";',
    '})()'
  ].join("\n"));
  await shot("04-protocol-preview", [
    'switchView("protocol");',
    'renderProtocolPreview({ docNumber: "TP_Nov25_98", patientName: "Short", age: "30",',
    '  gender: "Male", address: "Nashik", diagnosis: "Test", assessmentDate: "2025-11-10",',
    '  physio: "Dr. S", signBy: "Dr. S", designation: "Physiotherapist",',
    '  exercises: ["Knee extension", "Quad sets", "Heel slides"] });',
    'document.getElementById("protocol-preview").scrollIntoView({ block: "start" }); "ok"'
  ].join("\n"));
  await shot("05-patients", 'switchView("patients"); window.scrollTo(0, 99999); "ok"');
  await shot("06-settings", 'switchView("settings"); loadSettingsView(); "ok"');

  win.setSize(390, 844);
  await js('window.dispatchEvent(new Event("resize")); new Promise(r => setTimeout(r, 500))');
  await shot("07-mobile-invoice", 'switchView("invoice"); window.scrollTo(0,0); "ok"');
  await shot("08-mobile-calendar", [
    'document.querySelector("#itemsTable tbody tr .pick-dates-btn").scrollIntoView({block:"center"});',
    'document.querySelector("#itemsTable tbody tr .pick-dates-btn").click(); "ok"'
  ].join("\n"));

  // =====================================================================
  console.log("\nConsole errors");
  // =====================================================================
  check("no uncaught console errors during the run", consoleErrors.length === 0,
    consoleErrors.slice(0, 3).join(" | "));

  // =====================================================================
  const failed = results.filter(r => !r.pass);
  console.log("\n" + "=".repeat(68));
  console.log(results.length - failed.length + " passed, " + failed.length + " failed");
  if (failed.length) {
    console.log("\nFailures:");
    failed.forEach(f => console.log("  - " + f.name + (f.detail ? "  (" + f.detail + ")" : "")));
  }
  console.log("\nArtifacts in " + OUT_DIR);
  console.log("=".repeat(68) + "\n");

  server.close();
  app.exit(failed.length ? 1 : 0);
}

app.whenReady().then(() => {
  main().catch(err => {
    console.error("\nHARNESS ERROR:", err);
    app.exit(2);
  });
});
