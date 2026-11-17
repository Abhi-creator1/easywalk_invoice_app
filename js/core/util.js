// Shared helpers used by every view. Loaded before all feature scripts.

// =======================
// HTML ESCAPING
// =======================
const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

// Safe for both text content and quoted attribute values. (The previous
// innerText-based version left quotes untouched, which broke <option value="...">
// for any patient name containing an apostrophe.)
function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

// For values that come from a <textarea> and should keep their line breaks.
function escapeMultiline(value) {
  return escapeHtml(value).replace(/\r?\n/g, "<br/>");
}

// =======================
// NUMBERS / MONEY
// =======================
function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatINR(amount) {
  return "₹ " + toNumber(amount).toFixed(2);
}

// =======================
// DATES
// =======================
// All date maths goes through UTC midnight so that adding days can never be
// shifted by a timezone or DST boundary.
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

const MONTH_NAMES_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isoToUtcMs(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcMsToIso(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function addDays(iso, days) {
  return utcMsToIso(isoToUtcMs(iso) + days * 86400000);
}

function isNextDay(isoA, isoB) {
  return addDays(isoA, 1) === isoB;
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function daysInMonth(year, month1) {
  return new Date(year, month1, 0).getDate();
}

// dd/mm/yy — the compact form used on invoice date chips and in the PDF table.
function formatChipDate(iso) {
  if (!isIsoDate(iso)) return iso || "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

// dd/mm/yyyy — the form used everywhere a date is shown on its own
// (history tables, document bodies), replacing the raw ISO that used to leak out.
function formatDMY(iso) {
  if (!isIsoDate(iso)) return iso || "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function isFirstDayOfMonth(iso) {
  return Number(iso.split("-")[2]) === 1;
}

function isLastDayOfMonth(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return daysInMonth(y, m) === d;
}

function formatMonthYear(iso) {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

// A span covering whole calendar months reads as "November 2025" rather than
// "01/11/25 - 30/11/25", which is how the clinic bills.
function formatRangeLabel(fromIso, toIso) {
  if (isFirstDayOfMonth(fromIso) && isLastDayOfMonth(toIso)) {
    const fromLabel = formatMonthYear(fromIso);
    const toLabel = formatMonthYear(toIso);
    return fromLabel === toLabel ? fromLabel : `${fromLabel} - ${toLabel}`;
  }
  return `${formatChipDate(fromIso)} - ${formatChipDate(toIso)}`;
}

// =======================
// TREATMENT DATE ENTRIES
// =======================
// Stored shape, unchanged from the desktop app so old invoices stay readable:
//   { type: "single", date: "2025-11-03" }
//   { type: "range",  from: "2025-11-01", to: "2025-11-30" }

function formatDateEntry(entry) {
  if (!entry) return "-";
  if (typeof entry === "string") return formatChipDate(entry);          // very old records
  return entry.type === "range"
    ? formatRangeLabel(entry.from, entry.to)
    : formatChipDate(entry.date);
}

// Flat set of ISO dates -> stored entries, collapsing consecutive runs into ranges.
function datesToEntries(isoDates) {
  const sorted = [...isoDates].filter(isIsoDate).sort();
  const entries = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && isNextDay(sorted[j], sorted[j + 1])) j++;
    entries.push(j > i
      ? { type: "range", from: sorted[i], to: sorted[j] }
      : { type: "single", date: sorted[i] });
    i = j + 1;
  }
  return entries;
}

// Stored entries -> flat set, for loading a saved invoice back into the editor.
// Tolerates the legacy shapes (a bare string, or a plain array of strings).
function entriesToDates(entries) {
  const dates = new Set();
  const list = Array.isArray(entries) ? entries : [];
  list.forEach(entry => {
    if (typeof entry === "string") {
      if (isIsoDate(entry)) dates.add(entry);
      return;
    }
    if (!entry || typeof entry !== "object") return;
    if (entry.type === "range" && isIsoDate(entry.from) && isIsoDate(entry.to)) {
      for (let d = entry.from; d <= entry.to; d = addDays(d, 1)) dates.add(d);
    } else if (isIsoDate(entry.date)) {
      dates.add(entry.date);
    }
  });
  return dates;
}

// Total number of calendar days an entry list covers — used to keep
// "No. of Sessions" in step with the dates actually selected.
function countEntryDates(entries) {
  return entriesToDates(entries).size;
}

// =======================
// FILENAMES
// =======================
function sanitizeFilenamePart(str) {
  return (str || "").trim().replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_") || "Document";
}

// =======================
// TOASTS
// =======================
// Replaces silent failure: every await on window.api is wrapped by run() below,
// so a storage or PDF error becomes something the user can actually see.
function toast(message, kind = "info", ms = 4000) {
  let host = document.getElementById("toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "toast-host";
    document.body.appendChild(host);
  }

  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  host.appendChild(el);

  const remove = () => {
    el.classList.add("toast-out");
    setTimeout(() => el.remove(), 250);
  };
  el.addEventListener("click", remove);
  setTimeout(remove, ms);
}

// Runs an async action, surfacing any failure instead of leaving the UI silent.
// Returns { ok, value } so callers can skip their success path on failure.
async function run(action, { failure = "Something went wrong.", success } = {}) {
  try {
    const value = await action();
    if (success) toast(success, "success");
    return { ok: true, value };
  } catch (err) {
    console.error(failure, err);
    toast(`${failure} ${err && err.message ? "(" + err.message + ")" : ""}`.trim(), "error", 8000);
    return { ok: false, error: err };
  }
}
