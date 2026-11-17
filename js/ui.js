// Invoice numbering and the invoice history table.

// The number shown in the field is a *peek* at what the next one will be; the
// counter is only actually consumed when the invoice is saved. That keeps the
// sequence gapless even if the user opens the app and never saves anything,
// while still letting them see and override the number beforehand.
async function generateInvoiceNumber() {
  const field = document.getElementById("invoiceNumber");
  const result = await run(() => window.api.peekDocNumber("EW", { monthStyle: "long" }), {
    failure: "Could not work out the next invoice number."
  });
  if (!result.ok) return;
  field.value = result.value;
  invoiceForm.dataset.suggestedNumber = result.value;
}

// Called from the submit handler: if the user left the suggested number alone,
// mint it properly so the counter advances.
async function consumeInvoiceNumber(currentValue) {
  if (currentValue !== invoiceForm.dataset.suggestedNumber) return currentValue;
  const minted = await window.api.nextDocNumber("EW", { monthStyle: "long" });
  return minted;
}

async function loadInvoiceHistory() {
  const result = await run(() => db.invoices.toArray(), {
    failure: "Could not load the invoice history."
  });
  if (!result.ok) return;

  // Newest first, which is the order they are actually looked for in.
  const invoices = result.value.slice().sort((a, b) =>
    String(b.createdAt || b.invoiceDate || "").localeCompare(String(a.createdAt || a.invoiceDate || "")));

  const tbody = document.querySelector("#historyTable tbody");

  if (invoices.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-row">No invoices saved yet.</td></tr>';
    return;
  }

  tbody.innerHTML = invoices.map(invoice => {
    const customer = invoice.customer || {};
    return "<tr>" +
      "<td>" + escapeHtml(invoice.invoiceNumber) + "</td>" +
      "<td>" + escapeHtml(formatDMY(invoice.invoiceDate)) + "</td>" +
      "<td>" + escapeHtml(customer.name || "-") + "</td>" +
      "<td>" + formatINR(invoice.total) + "</td>" +
      '<td class="row-actions">' +
        '<button type="button" data-act="view" data-id="' + escapeHtml(invoice.invoiceNumber) + '">View</button>' +
        '<button type="button" data-act="edit" data-id="' + escapeHtml(invoice.invoiceNumber) + '">Edit</button>' +
        '<button type="button" class="danger" data-act="delete" data-id="' + escapeHtml(invoice.invoiceNumber) + '">Delete</button>' +
      "</td>" +
      "</tr>";
  }).join("");

  // One delegated handler rather than a listener per row.
  tbody.onclick = async event => {
    const button = event.target.closest("button[data-act]");
    if (!button) return;

    const invoice = invoices.find(item => item.invoiceNumber === button.dataset.id);
    if (!invoice) return;

    if (button.dataset.act === "view") {
      populatePreview(invoice);
      document.getElementById("invoice-preview")
        .scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (button.dataset.act === "edit") {
      loadInvoiceIntoForm(invoice);
      return;
    }

    if (button.dataset.act === "delete") {
      const confirmed = window.confirm(
        "Delete invoice " + invoice.invoiceNumber + "?\n\n" +
        "This removes it from the list and from the patient's billing total. " +
        "Any PDF already downloaded is not affected.\n\nThis cannot be undone.");
      if (!confirmed) return;

      const outcome = await run(() => db.invoices.remove(invoice.invoiceNumber), {
        failure: "Could not delete that invoice."
      });
      if (!outcome.ok) return;

      toast("Invoice " + invoice.invoiceNumber + " deleted.", "success");
      await loadInvoiceHistory();
      if (typeof loadPatients === "function") await loadPatients();
    }
  };
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("invoiceDate").valueAsDate = new Date();
  generateInvoiceNumber();
  loadInvoiceHistory();
});
