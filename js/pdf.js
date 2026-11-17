// Print buttons. The actual isolation + restore logic lives in
// js/pdfOptions.js (printElement), which is what fixes the trailing blank page.
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("printDocBtn").addEventListener("click", () => {
    const preview = document.getElementById("invoice-preview");
    const items = document.getElementById("p-items");

    if (!items || items.children.length === 0) {
      toast("Save or open an invoice first, then print it.", "error");
      return;
    }

    preview.style.display = "flex";
    printElement(preview, {
      title: document.getElementById("invoiceNumber").value || "Invoice"
    });
  });
});
