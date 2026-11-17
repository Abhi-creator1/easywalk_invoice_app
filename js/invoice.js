// =======================
// ELEMENT REFERENCES
// =======================
const itemsTableBody = document.querySelector("#itemsTable tbody");
const addItemBtn = document.getElementById("addItemBtn");

// =======================
// UTILITIES
// =======================
function formatINR(amount) {
  return "₹ " + amount.toFixed(2);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value;
}

function sanitizeFilenamePart(str) {
  return (str || "").trim().replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_") || "Invoice";
}

// =======================
// LINE ITEMS (Treatment Dates)
// =======================
function addItemRow() {
  const row = document.createElement("tr");

  row.innerHTML = `
    <td class="dates-cell">
      <div class="date-chips"></div>
      <div class="date-add-row">
        <input type="date" class="date-input" />
        <button type="button" class="add-date-btn">+ Add Date</button>
      </div>
      <div class="date-add-row">
        <input type="date" class="range-from-input" />
        <span>to</span>
        <input type="date" class="range-to-input" />
        <button type="button" class="add-range-btn">+ Add Range</button>
      </div>
    </td>
    <td><input type="text" class="duration" placeholder="1hr" /></td>
    <td><input type="number" class="qty" value="1" min="1" /></td>
    <td><input type="number" class="rate" value="0" min="0" /></td>
    <td class="amount">₹ 0.00</td>
    <td><button type="button" class="remove">✕</button></td>
  `;

  row.querySelectorAll(".qty, .rate").forEach(input => {
    input.addEventListener("input", calculateTotals);
  });

  row.querySelector(".add-date-btn").addEventListener("click", () => {
    const dateInput = row.querySelector(".date-input");
    if (!dateInput.value) return;
    addDateChip(row, dateInput.value);
    dateInput.value = "";
  });

  row.querySelector(".add-range-btn").addEventListener("click", () => {
    const fromInput = row.querySelector(".range-from-input");
    const toInput = row.querySelector(".range-to-input");
    if (!fromInput.value || !toInput.value) return;
    if (toInput.value < fromInput.value) {
      alert("Range end date must be on or after the start date.");
      return;
    }
    addRangeChip(row, fromInput.value, toInput.value);
    fromInput.value = "";
    toInput.value = "";
  });

  row.querySelector(".remove").addEventListener("click", () => {
    row.remove();
    calculateTotals();
  });

  itemsTableBody.appendChild(row);
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

function formatChipDate(isoDate) {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

function isFirstDayOfMonth(isoDate) {
  return Number(isoDate.split("-")[2]) === 1;
}

function isLastDayOfMonth(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m, 0).getDate() === d;
}

function formatMonthYear(isoDate) {
  const [y, m] = isoDate.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function formatRangeLabel(fromIso, toIso) {
  if (isFirstDayOfMonth(fromIso) && isLastDayOfMonth(toIso)) {
    const fromLabel = formatMonthYear(fromIso);
    const toLabel = formatMonthYear(toIso);
    return fromLabel === toLabel ? fromLabel : `${fromLabel} - ${toLabel}`;
  }
  return `${formatChipDate(fromIso)} - ${formatChipDate(toIso)}`;
}

function addDateChip(row, isoDate) {
  const chip = document.createElement("span");
  chip.className = "date-chip";
  chip.dataset.type = "single";
  chip.dataset.date = isoDate;
  chip.innerHTML = `${formatChipDate(isoDate)} <button type="button" class="remove-chip">✕</button>`;

  chip.querySelector(".remove-chip").addEventListener("click", () => chip.remove());

  row.querySelector(".date-chips").appendChild(chip);
}

function addRangeChip(row, fromIso, toIso) {
  const chip = document.createElement("span");
  chip.className = "date-chip";
  chip.dataset.type = "range";
  chip.dataset.from = fromIso;
  chip.dataset.to = toIso;
  chip.innerHTML = `${formatRangeLabel(fromIso, toIso)} <button type="button" class="remove-chip">✕</button>`;

  chip.querySelector(".remove-chip").addEventListener("click", () => chip.remove());

  row.querySelector(".date-chips").appendChild(chip);
}

function getRowDates(row) {
  return [...row.querySelectorAll(".date-chip")].map(chip =>
    chip.dataset.type === "range"
      ? { type: "range", from: chip.dataset.from, to: chip.dataset.to }
      : { type: "single", date: chip.dataset.date }
  );
}

function formatDateEntry(entry) {
  return entry.type === "range" ? formatRangeLabel(entry.from, entry.to) : formatChipDate(entry.date);
}

// =======================
// CALCULATIONS
// =======================
function calculateTotals() {
  let subtotal = 0;

  document.querySelectorAll("#itemsTable tbody tr").forEach(row => {
    const qty = Number(row.querySelector(".qty").value) || 0;
    const rate = Number(row.querySelector(".rate").value) || 0;
    const amount = qty * rate;

    row.querySelector(".amount").innerText = formatINR(amount);
    subtotal += amount;
  });

  const cgst = Number(document.getElementById("cgst").value) || 0;
  const sgst = Number(document.getElementById("sgst").value) || 0;
  const gstPercent = cgst + sgst;
  const gstAmount = subtotal * gstPercent / 100;

  const total = subtotal + gstAmount;
  const paid = Number(document.getElementById("paidAmount").value) || 0;
  const balance = total - paid;

  setText("subtotal", formatINR(subtotal));
  setText("gstPercent", gstPercent);
  setText("gstAmount", formatINR(gstAmount));
  setText("total", formatINR(total));
  setText("balance", formatINR(balance));
}

// GST / Paid listeners
["cgst", "sgst", "paidAmount"].forEach(id => {
  document.getElementById(id).addEventListener("input", calculateTotals);
});

// Initial setup
addItemRow();
calculateTotals();
addItemBtn.addEventListener("click", addItemRow);

// =======================
// IPD / OPD PATIENT LINKING
// =======================
document.getElementById("invoicePatientType").addEventListener("change", e => {
  const isIpd = e.target.value === "IPD";
  document.getElementById("invoicePatientPicker").style.display = isIpd ? "block" : "none";
  document.getElementById("invoiceOpdNote").style.display = isIpd ? "none" : "block";
});

document.getElementById("invoicePatientSelect").addEventListener("change", async e => {
  const patient = await db.patients.get(e.target.value);
  if (!patient) return;
  document.getElementById("customerName").value = patient.name || "";
  document.getElementById("customerAge").value = patient.age || "";
  document.getElementById("customerGender").value = patient.gender || "";
  document.getElementById("customerPhone").value = patient.phone || "";
  document.getElementById("customerAddress").value = patient.address || "";
  document.getElementById("treatment").value = patient.diagnosis || "";
  e.target.blur();
});

// =======================
// PREVIEW
// =======================
function populatePreview(invoice) {
  setText("p-invoiceNumber", invoice.invoiceNumber);
  setText("p-invoiceDate", invoice.invoiceDate);

  setText("p-customerName", invoice.customer.name);
  setText("p-customerAge", invoice.customer.age || "-");
  setText("p-customerGender", invoice.customer.gender || "-");
  setText("p-customerPhone", invoice.customer.phone);
  setText("p-customerAddress", invoice.customer.address);
  setText("p-treatment", invoice.treatment || "-");

  setText("p-subtotal", formatINR(invoice.subtotal));
  setText("p-gstPercent", invoice.cgst + invoice.sgst);
  setText("p-gstAmount", formatINR(invoice.gstAmount));
  setText("p-cgst", invoice.cgst);
  setText("p-sgst", invoice.sgst);
  setText("p-paid", formatINR(invoice.paid));
  setText("p-balance", formatINR(invoice.balance));

  const itemsBody = document.getElementById("p-items");
  itemsBody.innerHTML = "";

  invoice.items.forEach(item => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${(item.dates || []).map(formatDateEntry).join(", ") || "-"}</td>
      <td>${item.duration}</td>
      <td>${item.quantity}</td>
      <td>${formatINR(item.rate)}</td>
      <td>${formatINR(item.amount)}</td>
    `;
    itemsBody.appendChild(row);
  });

  document.getElementById("invoice-preview").style.display = "flex";
}

async function generateInvoicePdf(invoice) {
  const preview = document.getElementById("invoice-preview");
  preview.style.display = "flex";

  const opt = {
    margin: 0,
    filename: `${invoice.invoiceNumber}.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 3 },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
  };

  const pdf = await html2pdf().set(opt).from(preview).toPdf().get("pdf");
  const arrayBuffer = pdf.output("arraybuffer");

  const filename = `${sanitizeFilenamePart(invoice.customer.name)}_${sanitizeFilenamePart(invoice.invoiceNumber)}`;
  return window.api.savePdf(new Uint8Array(arrayBuffer), "invoice", filename);
}

// =======================
// SAVE INVOICE
// =======================
document.getElementById("invoice-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  let subtotal = 0;
  const items = [];

  document.querySelectorAll("#itemsTable tbody tr").forEach(row => {
    const qty = Number(row.querySelector(".qty").value) || 0;
    const rate = Number(row.querySelector(".rate").value) || 0;
    const amount = qty * rate;
    const duration = row.querySelector(".duration").value || "1hr";
    const dates = getRowDates(row);

    items.push({
      dates,
      duration,
      quantity: qty,
      rate: rate,
      amount: amount
    });

    subtotal += amount;
  });

  const cgst = Number(document.getElementById("cgst").value) || 0;
  const sgst = Number(document.getElementById("sgst").value) || 0;
  const gstAmount = subtotal * (cgst + sgst) / 100;
  const total = subtotal + gstAmount;
  const paid = Number(document.getElementById("paidAmount").value) || 0;
  const balance = total - paid;

  const patientType = document.getElementById("invoicePatientType").value;
  const patientId = patientType === "IPD" ? document.getElementById("invoicePatientSelect").value : null;

  if (patientType === "IPD" && !patientId) {
    alert("Please select an IPD patient, or add one under Patients (IPD).");
    return;
  }

  const invoice = {
    invoiceNumber: document.getElementById("invoiceNumber").value,
    invoiceDate: document.getElementById("invoiceDate").value,
    patientType,
    patientId,

    customer: {
      name: document.getElementById("customerName").value,
      phone: document.getElementById("customerPhone").value,
      address: document.getElementById("customerAddress").value,
      age: document.getElementById("customerAge").value,
      gender: document.getElementById("customerGender").value
    },
    treatment: document.getElementById("treatment").value,

    items,
    subtotal,
    cgst,
    sgst,
    gstAmount,
    total,
    paid,
    balance,

    currency: "INR",
    createdAt: new Date().toISOString()
  };

  await db.invoices.put(invoice);

  if (patientType === "IPD" && patientId) {
    await db.patients.linkDocument({
      patientId,
      docType: "invoice",
      docNumber: invoice.invoiceNumber,
      date: invoice.invoiceDate || invoice.createdAt.slice(0, 10),
      amount: total
    });
    if (typeof loadPatients === "function") await loadPatients();
  }

  populatePreview(invoice);
  const filePath = await generateInvoicePdf(invoice);
  loadInvoiceHistory();

  alert(`Invoice saved and PDF exported to:\n${filePath}`);
});
