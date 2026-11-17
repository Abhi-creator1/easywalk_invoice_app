document.getElementById("printDocBtn").addEventListener("click", () => {
  const preview = document.getElementById("invoice-preview");
  const invoiceNo = document.getElementById("invoiceNumber").value || "Invoice";

  preview.style.display = "flex";
  preview.classList.add("print-target");

  const originalTitle = document.title;
  document.title = invoiceNo;

  setTimeout(() => {
    window.print();
    preview.classList.remove("print-target");
    setTimeout(() => {
      document.title = originalTitle;
    }, 500);
  }, 100);
});
