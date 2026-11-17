// =======================
// ELEMENT REFERENCES
// =======================
const invoiceForm = document.getElementById("invoice-form");
const itemsTableBody = document.querySelector("#itemsTable tbody");
const addItemBtn = document.getElementById("addItemBtn");

// =======================
// LINE ITEMS (Treatment Dates)
// =======================
// Each row owns a Set of ISO dates. The chips and the stored range/single
// entries are both derived from it, so there is one source of truth per row.
const rowDateSelections = new WeakMap();

function rowDates(row) {
  if (!rowDateSelections.has(row)) rowDateSelections.set(row, new Set());
  return rowDateSelections.get(row);
}

function setRowDates(row, dates) {
  rowDateSelections.set(row, new Set(dates));
  renderRowChips(row);
  syncRowSessions(row);
  calculateTotals();
}

function renderRowChips(row) {
  const host = row.querySelector(".date-chips");
  const entries = datesToEntries(rowDates(row));

  if (entries.length === 0) {
    host.innerHTML = '<span class="date-empty">No dates selected yet</span>';
    return;
  }

  host.innerHTML = entries.map((entry, index) =>
    '<span class="date-chip">' + escapeHtml(formatDateEntry(entry)) +
    '<button type="button" class="remove-chip" data-index="' + index +
    '" aria-label="Remove these dates">&#10005;</button></span>').join("");
}

// "No. of Sessions" follows the number of dates picked, which is what it means
// in practice. It stops following as soon as the user types in the field
// themselves, so an unusual invoice can still be entered by hand.
function syncRowSessions(row) {
  const qtyInput = row.querySelector(".qty");
  if (row.dataset.qtyManual === "1") return;
  const count = rowDates(row).size;
  if (count > 0) qtyInput.value = count;
}

function addItemRow(prefill) {
  const data = prefill || {};
  const row = document.createElement("tr");

  row.innerHTML = `
    <td class="dates-cell">
      <div class="date-chips"></div>
      <div class="date-controls">
        <button type="button" class="pick-dates-btn">&#128197; Select dates</button>
      </div>
      <input type="text" class="date-manual" placeholder="or type: 3/11/25, 7/11/25, 10/11/25 - 14/11/25" />
      <p class="date-manual-error" hidden></p>
    </td>
    <td><input type="text" class="duration" placeholder="1hr" /></td>
    <td><input type="number" class="qty" value="1" min="0" /></td>
    <td><input type="number" class="rate" value="0" min="0" /></td>
    <td class="amount">₹ 0.00</td>
    <td><button type="button" class="remove" aria-label="Remove this row">&#10005;</button></td>
  `;

  row.querySelector(".duration").value = data.duration || "";
  if (data.quantity !== undefined) {
    row.querySelector(".qty").value = data.quantity;
    row.dataset.qtyManual = "1";   // a saved value must not be overwritten
  }
  if (data.rate !== undefined) row.querySelector(".rate").value = data.rate;

  row.querySelector(".rate").addEventListener("input", calculateTotals);
  row.querySelector(".qty").addEventListener("input", () => {
    row.dataset.qtyManual = "1";
    calculateTotals();
  });

  row.querySelector(".pick-dates-btn").addEventListener("click", event => {
    openDatePicker({
      anchorEl: event.currentTarget,
      dates: rowDates(row),
      onChange: dates => setRowDates(row, dates)
    });
  });

  // Chip removal, delegated so it survives re-rendering.
  row.querySelector(".date-chips").addEventListener("click", event => {
    const button = event.target.closest(".remove-chip");
    if (!button) return;
    const entries = datesToEntries(rowDates(row));
    const entry = entries[Number(button.dataset.index)];
    if (!entry) return;

    const remaining = new Set(rowDates(row));
    entriesToDates([entry]).forEach(iso => remaining.delete(iso));
    setRowDates(row, remaining);
  });

  const manualInput = row.querySelector(".date-manual");
  const manualError = row.querySelector(".date-manual-error");

  function commitManualEntry() {
    const text = manualInput.value.trim();
    if (!text) {
      manualError.hidden = true;
      return;
    }

    const parsed = parseManualDates(text);
    const merged = new Set(rowDates(row));
    parsed.dates.forEach(iso => merged.add(iso));

    if (parsed.errors.length > 0) {
      manualError.hidden = false;
      manualError.textContent = "Could not read: " + parsed.errors.join(", ");
    } else {
      manualError.hidden = true;
      manualInput.value = "";
    }

    if (parsed.dates.size > 0) setRowDates(row, merged);
  }

  manualInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitManualEntry();
    }
  });
  manualInput.addEventListener("blur", commitManualEntry);

  row.querySelector(".remove").addEventListener("click", () => {
    row.remove();
    if (itemsTableBody.children.length === 0) addItemRow();
    calculateTotals();
  });

  itemsTableBody.appendChild(row);

  if (data.dates) rowDateSelections.set(row, entriesToDates(data.dates));
  renderRowChips(row);
  if (data.quantity === undefined) syncRowSessions(row);

  return row;
}

// =======================
// CALCULATIONS
// =======================
function collectItems() {
  const items = [];
  let subtotal = 0;

  itemsTableBody.querySelectorAll("tr").forEach(row => {
    const quantity = toNumber(row.querySelector(".qty").value);
    const rate = toNumber(row.querySelector(".rate").value);
    const amount = quantity * rate;

    items.push({
      dates: datesToEntries(rowDates(row)),
      duration: row.querySelector(".duration").value || "1hr",
      quantity,
      rate,
      amount
    });

    row.querySelector(".amount").innerText = formatINR(amount);
    subtotal += amount;
  });

  return { items, subtotal };
}

function calculateTotals() {
  const { subtotal } = collectItems();

  const cgst = toNumber(document.getElementById("cgst").value);
  const sgst = toNumber(document.getElementById("sgst").value);
  const gstPercent = cgst + sgst;
  const gstAmount = subtotal * gstPercent / 100;

  const total = subtotal + gstAmount;
  const paid = toNumber(document.getElementById("paidAmount").value);
  const balance = total - paid;

  setText("subtotal", formatINR(subtotal));
  setText("gstPercent", gstPercent);
  setText("gstAmount", formatINR(gstAmount));
  setText("total", formatINR(total));
  setText("balance", formatINR(balance));

  return { subtotal, cgst, sgst, gstAmount, total, paid, balance };
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value;
}

// =======================
// PREVIEW
// =======================
function populatePreview(invoice) {
  const customer = invoice.customer || {};

  setText("p-invoiceNumber", invoice.invoiceNumber);
  setText("p-invoiceDate", formatDMY(invoice.invoiceDate));

  setText("p-customerName", customer.name || "-");
  setText("p-customerAge", customer.age || "-");
  setText("p-customerGender", customer.gender || "-");
  setText("p-customerPhone", customer.phone || "-");
  setText("p-customerAddress", customer.address || "-");
  setText("p-treatment", invoice.treatment || "-");

  setText("p-subtotal", formatINR(invoice.subtotal));
  setText("p-gstPercent", toNumber(invoice.cgst) + toNumber(invoice.sgst));
  setText("p-gstAmount", formatINR(invoice.gstAmount));
  setText("p-cgst", toNumber(invoice.cgst));
  setText("p-sgst", toNumber(invoice.sgst));
  setText("p-total", formatINR(invoice.total));
  setText("p-paid", formatINR(invoice.paid));
  setText("p-balance", formatINR(invoice.balance));

  const itemsBody = document.getElementById("p-items");
  itemsBody.innerHTML = (invoice.items || []).map(item => {
    const dates = Array.isArray(item.dates) ? item.dates : [];
    const label = dates.map(formatDateEntry).join(", ") || "-";
    return "<tr>" +
      "<td>" + escapeHtml(label) + "</td>" +
      "<td>" + escapeHtml(item.duration || "-") + "</td>" +
      "<td>" + escapeHtml(item.quantity) + "</td>" +
      "<td>" + formatINR(item.rate) + "</td>" +
      "<td>" + formatINR(item.amount) + "</td>" +
      "</tr>";
  }).join("");

  document.getElementById("invoice-preview").style.display = "flex";
}

async function generateInvoicePdf(invoice) {
  const preview = document.getElementById("invoice-preview");
  preview.style.display = "flex";

  const filename = sanitizeFilenamePart(invoice.customer.name) + "_" +
    sanitizeFilenamePart(invoice.invoiceNumber);

  return exportElementToPdf(preview, { filename, docType: "invoice" });
}

// =======================
// LOAD AN EXISTING INVOICE BACK INTO THE FORM
// =======================
function loadInvoiceIntoForm(invoice) {
  const customer = invoice.customer || {};

  invoiceForm.dataset.editing = invoice.invoiceNumber;
  document.getElementById("invoiceNumber").value = invoice.invoiceNumber || "";
  document.getElementById("invoiceDate").value = invoice.invoiceDate || "";

  document.getElementById("invoicePatientType").value = invoice.patientType || "OPD";
  document.getElementById("invoicePatientType").dispatchEvent(new Event("change"));
  if (invoice.patientId) document.getElementById("invoicePatientSelect").value = invoice.patientId;

  document.getElementById("customerName").value = customer.name || "";
  document.getElementById("customerAge").value = customer.age || "";
  document.getElementById("customerGender").value = customer.gender || "";
  document.getElementById("customerPhone").value = customer.phone || "";
  document.getElementById("customerAddress").value = customer.address || "";
  document.getElementById("treatment").value = invoice.treatment || "";

  document.getElementById("cgst").value = toNumber(invoice.cgst);
  document.getElementById("sgst").value = toNumber(invoice.sgst);
  document.getElementById("paidAmount").value = toNumber(invoice.paid);

  itemsTableBody.innerHTML = "";
  const items = Array.isArray(invoice.items) && invoice.items.length ? invoice.items : [{}];
  items.forEach(item => addItemRow(item));

  calculateTotals();
  updateEditingBanner();
  invoiceForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function clearInvoiceForm() {
  delete invoiceForm.dataset.editing;
  invoiceForm.reset();
  itemsTableBody.innerHTML = "";
  addItemRow();
  document.getElementById("invoiceDate").valueAsDate = new Date();
  document.getElementById("invoicePatientType").dispatchEvent(new Event("change"));
  calculateTotals();
  updateEditingBanner();
  generateInvoiceNumber();
}

function updateEditingBanner() {
  const banner = document.getElementById("invoiceEditingBanner");
  if (!banner) return;
  const editing = invoiceForm.dataset.editing;
  banner.hidden = !editing;
  if (editing) {
    banner.querySelector("span").textContent = "Editing invoice " + editing;
  }
}

// =======================
// SAVE INVOICE
// =======================
invoiceForm.addEventListener("submit", async event => {
  event.preventDefault();

  const invoiceNumberField = document.getElementById("invoiceNumber");
  const invoiceNumber = invoiceNumberField.value.trim();
  if (!invoiceNumber) {
    toast("Enter an invoice number before saving.", "error");
    invoiceNumberField.focus();
    return;
  }

  const patientType = document.getElementById("invoicePatientType").value;
  const patientId = patientType === "IPD"
    ? document.getElementById("invoicePatientSelect").value
    : null;

  if (patientType === "IPD" && !patientId) {
    toast("Select an IPD patient, or add one under Patients (IPD).", "error");
    return;
  }

  const editing = invoiceForm.dataset.editing || "";

  // If the suggested number was left untouched, consume it now so the counter
  // actually advances and the next invoice gets _02.
  let finalNumber = invoiceNumber;
  if (!editing) {
    const minted = await run(() => consumeInvoiceNumber(invoiceNumber), {
      failure: "Could not assign an invoice number."
    });
    if (!minted.ok) return;
    finalNumber = minted.value;
    invoiceNumberField.value = finalNumber;
  }

  // Safety net for a hand-edited number: numbers are sequenced automatically
  // now, but the field is still editable and saving over an existing invoice
  // used to destroy it silently.
  if (finalNumber !== editing) {
    const clash = await db.invoices.get(finalNumber);
    if (clash) {
      const proceed = window.confirm(
        "Invoice " + finalNumber + " already exists (" +
        (clash.customer && clash.customer.name ? clash.customer.name : "unknown") + ", " +
        formatINR(clash.total) + ").\n\nSaving will replace it. Continue?");
      if (!proceed) return;
    }
  }

  const { items, subtotal } = collectItems();
  const totals = calculateTotals();

  const invoice = {
    invoiceNumber: finalNumber,
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
    cgst: totals.cgst,
    sgst: totals.sgst,
    gstAmount: totals.gstAmount,
    total: totals.total,
    paid: totals.paid,
    balance: totals.balance,

    currency: "INR",
    createdAt: new Date().toISOString()
  };

  const saved = await run(async () => {
    await db.invoices.put(invoice);

    if (patientType === "IPD" && patientId) {
      await db.patients.linkDocument({
        patientId,
        docType: "invoice",
        docNumber: invoice.invoiceNumber,
        date: invoice.invoiceDate || invoice.createdAt.slice(0, 10),
        amount: invoice.total
      });
      if (typeof loadPatients === "function") await loadPatients();
    }
  }, { failure: "The invoice could not be saved." });

  if (!saved.ok) return;

  populatePreview(invoice);

  const pdf = await run(() => generateInvoicePdf(invoice), {
    failure: "The invoice was saved, but the PDF could not be created."
  });

  await run(() => loadInvoiceHistory(), { failure: "Could not refresh the invoice list." });

  delete invoiceForm.dataset.editing;
  updateEditingBanner();

  if (pdf.ok) {
    toast("Invoice " + invoice.invoiceNumber + " saved. PDF: " + pdf.value, "success", 6000);
  }

  // The field now shows what the *next* invoice will be numbered.
  invoiceForm.dataset.savedNumber = invoice.invoiceNumber;
  generateInvoiceNumber();
});

// =======================
// IPD / OPD PATIENT LINKING
// =======================
document.getElementById("invoicePatientType").addEventListener("change", event => {
  const isIpd = event.target.value === "IPD";
  document.getElementById("invoicePatientPicker").style.display = isIpd ? "block" : "none";
  document.getElementById("invoiceOpdNote").style.display = isIpd ? "none" : "block";
});

document.getElementById("invoicePatientSelect").addEventListener("change", async event => {
  if (!event.target.value) return;
  const result = await run(() => db.patients.get(event.target.value), {
    failure: "Could not load that patient."
  });
  const patient = result.value;
  if (!patient) return;

  document.getElementById("customerName").value = patient.name || "";
  document.getElementById("customerAge").value = patient.age || "";
  document.getElementById("customerGender").value = patient.gender || "";
  document.getElementById("customerPhone").value = patient.phone || "";
  document.getElementById("customerAddress").value = patient.address || "";
  document.getElementById("treatment").value = patient.diagnosis || "";
  event.target.blur();
});

// =======================
// INITIAL SETUP
// =======================
["cgst", "sgst", "paidAmount"].forEach(id => {
  document.getElementById(id).addEventListener("input", calculateTotals);
});

addItemBtn.addEventListener("click", () => addItemRow());

document.getElementById("invoiceClearBtn").addEventListener("click", () => {
  if (itemsTableBody.children.length && !window.confirm("Clear the form and start a new invoice?")) return;
  clearInvoiceForm();
});

addItemRow();
calculateTotals();
