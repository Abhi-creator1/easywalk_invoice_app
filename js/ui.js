async function generateInvoiceNumber() {
  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "short" });
  const year = now.getFullYear().toString().slice(-2);

  const monthKey = `${month}${year}`;

  let counterRecord = await db.counters.get(monthKey);

  let nextNumber = 1;
  if (counterRecord) {
    nextNumber = counterRecord.last + 1;
  }

  const invoiceNumber = `EW_${month}${year}_${String(nextNumber).padStart(2, "0")}`;

  // Save/update counter
  await db.counters.put({
    monthKey: monthKey,
    last: nextNumber
  });

  document.getElementById("invoiceNumber").value = invoiceNumber;
}

document.getElementById("invoiceDate").valueAsDate = new Date();

// Generate number on load
generateInvoiceNumber();

async function loadInvoiceHistory() {
  const invoices = await db.invoices.toArray();
  const tbody = document.querySelector("#historyTable tbody");

  tbody.innerHTML = "";

  invoices.forEach(inv => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${inv.invoiceNumber}</td>
      <td>${inv.invoiceDate}</td>
      <td>${inv.customer.name}</td>
      <td>₹ ${inv.total.toFixed(2)}</td>
      <td><button data-id="${inv.invoiceNumber}">View</button></td>
    `;

    row.querySelector("button").addEventListener("click", () => {
    populatePreview(inv);

    document.getElementById("invoice-preview")
        .scrollIntoView({ behavior: "smooth", block: "start" });
    });


    tbody.appendChild(row);
  });
}

function getInvoiceData() {
  // Retrieve values from the form
  const invoice = {
    invoiceNumber: document.getElementById("invoiceNumber").value,
    invoiceDate: document.getElementById("invoiceDate").value,
    customer: {
      name: document.getElementById("customerName").value,
      phone: document.getElementById("customerPhone").value,
      address: document.getElementById("customerAddress").value,
      age: document.getElementById("customerAge").value,
      gender: document.getElementById("customerGender").value,
    },
    items: [],
    subtotal: parseFloat(document.getElementById("subtotal").innerText.replace("₹", "").trim()) || 0,
    cgst: parseFloat(document.getElementById("cgst").value) || 0,
    sgst: parseFloat(document.getElementById("sgst").value) || 0,
    gstAmount: parseFloat(document.getElementById("gstAmount").innerText.replace("₹", "").trim()) || 0,
    total: parseFloat(document.getElementById("total").innerText.replace("₹", "").trim()) || 0,
    paid: parseFloat(document.getElementById("paidAmount").value) || 0,
    balance: parseFloat(document.getElementById("balance").innerText.replace("₹", "").trim()) || 0,
  };

  // Get items data from the table
  document.querySelectorAll("#itemsTable tbody tr").forEach((row) => {
    const description = row.querySelector(".desc").value;
    const qty = parseFloat(row.querySelector(".qty").value) || 0;
    const rate = parseFloat(row.querySelector(".rate").value) || 0;
    const amount = qty * rate;

    invoice.items.push({
      description,
      quantity: qty,
      rate,
      amount
    });
  });

  return invoice;
}


// Load history on app start

document.addEventListener("DOMContentLoaded", function() {
  // Existing event listeners
  loadInvoiceHistory();

  // Add event listener for syncing ledger
  document.getElementById("syncLedgerBtn").addEventListener("click", syncLedger);

  // Add event listener for Google Drive backup
  const backupButton = document.getElementById("backupDriveBtn");
  if (backupButton) {
    backupButton.addEventListener("click", () => {
      console.log("Backup button clicked!");  // Log to confirm button click
      const invoice = getInvoiceData(); // Now this function will work
      backupToDrive(invoice);
    });
  } else {
    console.error("Backup button not found!");  // Log an error if the button is not found
  }
});
