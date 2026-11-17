function generateInvoiceNumber() {
  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "long" });
  const year = now.getFullYear().toString().slice(-2);
  document.getElementById("invoiceNumber").value = `EW_${month}${year}`;
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

// Load history on app start

document.addEventListener("DOMContentLoaded", function() {
  loadInvoiceHistory();
});
