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

// =======================
// LINE ITEMS
// =======================
function addItemRow() {
  const row = document.createElement("tr");

  row.innerHTML = `
    <td><input type="text" class="desc" /></td>
    <td><input type="text" class="duration" placeholder="1hr" /></td> <!-- Added Duration Input -->
    <td><input type="number" class="qty" value="1" min="1" /></td>
    <td><input type="number" class="rate" value="0" min="0" /></td>
    <td class="amount">₹ 0.00</td>
    <td><button type="button" class="remove">✕</button></td>
  `;

  row.querySelectorAll(".qty, .rate").forEach(input => {
    input.addEventListener("input", calculateTotals);
  });

  row.querySelector(".remove").addEventListener("click", () => {
    row.remove();
    calculateTotals();
  });

  itemsTableBody.appendChild(row);
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
      <td>${item.description}</td>
      <td>${item.duration}</td> <!-- Added Duration to Preview -->
      <td>${item.quantity}</td>
      <td>${formatINR(item.rate)}</td>
      <td>${formatINR(item.amount)}</td>
    `;
    itemsBody.appendChild(row);
  });

  document.getElementById("invoice-preview").style.display = "block";
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
    const duration = row.querySelector(".duration").value || "1hr";  // Added Duration

    items.push({
      description: row.querySelector(".desc").value,
      duration: duration,  // Storing Duration
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

  const invoice = {
    invoiceNumber: document.getElementById("invoiceNumber").value,
    invoiceDate: document.getElementById("invoiceDate").value,

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
    syncStatus: "PENDING",
    createdAt: new Date().toISOString()
  };

  await db.invoices.put(invoice);

  populatePreview(invoice);
  loadInvoiceHistory();

  alert("Invoice saved locally ✅");
});
