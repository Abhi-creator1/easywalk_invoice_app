// =======================
// ADDITIONAL DOCUMENT (one-off, not saved to history)
// =======================
function buildAdditionalIntro(doc) {
  return `<h3 class="doc-title">${escapeHtml(doc.name || "DOCUMENT").toUpperCase()}</h3>`;
}

function renderAdditionalPreview(doc) {
  const html = buildPaginatedDocument({
    introHtml: buildAdditionalIntro(doc),
    outroHtml: renderSignStampBlock({ signBy: doc.signBy, designation: doc.designation }),
    items: [doc.content],
    renderItem: text => `<p class="cert-body">${escapeHtml(text).replace(/\n/g, "<br/>")}</p>`,
    itemsFirstPage: 1,
    itemsPerPage: 1
  });

  document.getElementById("additional-preview").innerHTML = html;
  document.getElementById("addDocPrintBtn").style.display = "inline-block";
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("addDocGenerateBtn").addEventListener("click", () => {
    const doc = {
      name: document.getElementById("addDocName").value,
      content: document.getElementById("addDocContent").value,
      signBy: document.getElementById("addDocSignBy").value,
      designation: document.getElementById("addDocDesignation").value
    };

    if (!doc.name || !doc.content) {
      alert("Please enter a document name and content.");
      return;
    }

    renderAdditionalPreview(doc);
    document.getElementById("additional-preview").scrollIntoView({ behavior: "smooth" });
  });

  document.getElementById("addDocPrintBtn").addEventListener("click", () => {
    const preview = document.getElementById("additional-preview");
    preview.classList.add("print-target");

    setTimeout(() => {
      window.print();
      preview.classList.remove("print-target");
    }, 100);
  });
});
