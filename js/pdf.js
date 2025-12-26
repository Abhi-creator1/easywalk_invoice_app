document.getElementById("downloadPdfBtn").addEventListener("click", () => {
  const preview = document.getElementById("invoice-preview");
  preview.style.display = "block";

  const invoiceNo = document.getElementById("invoiceNumber").value || "Invoice";

  // Save original title
  const originalTitle = document.title;

  // Set title to invoice number
  document.title = invoiceNo;

  setTimeout(() => {
    window.print();

    // Restore original title after print
    setTimeout(() => {
      document.title = originalTitle;
    }, 500);
  }, 100);
});
