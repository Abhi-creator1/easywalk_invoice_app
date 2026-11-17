// =======================
// ADDITIONAL DOCUMENT (one-off, not saved to history)
// =======================
let renderedAdditional = null;

function buildAdditionalIntro(doc) {
  return '<h3 class="doc-title">' +
    escapeHtml(String(doc.name || "DOCUMENT").toUpperCase()) + "</h3>";
}

function renderAdditionalPreview(doc) {
  renderedAdditional = doc;

  document.getElementById("additional-preview").innerHTML = buildPaginatedDocument({
    introHtml: buildAdditionalIntro(doc),
    outroHtml: renderSignStampBlock({ signBy: doc.signBy, designation: doc.designation }),
    items: splitTextIntoBlocks(doc.content),
    renderItem: text => '<p class="cert-body">' + escapeMultiline(text) + "</p>"
  });

  document.getElementById("addDocPrintBtn").style.display = "inline-block";
  document.getElementById("addDocDownloadBtn").style.display = "inline-block";
}

function additionalFilename(doc) {
  return sanitizeFilenamePart(doc.name) + "_" + todayIso();
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("addDocGenerateBtn").addEventListener("click", () => {
    const doc = {
      name: document.getElementById("addDocName").value,
      content: document.getElementById("addDocContent").value,
      signBy: document.getElementById("addDocSignBy").value,
      designation: document.getElementById("addDocDesignation").value
    };

    if (!doc.name.trim() || !doc.content.trim()) {
      toast("Enter a document name and some content.", "error");
      return;
    }

    renderAdditionalPreview(doc);
    document.getElementById("additional-preview").scrollIntoView({ behavior: "smooth" });
  });

  document.getElementById("addDocPrintBtn").addEventListener("click", () => {
    if (!renderedAdditional) return;
    printElement(document.getElementById("additional-preview"), {
      title: additionalFilename(renderedAdditional)
    });
  });

  // This document used to be print-only, which meant it did not work at all on
  // a phone, where window.print() is unreliable.
  document.getElementById("addDocDownloadBtn").addEventListener("click", async () => {
    if (!renderedAdditional) return;
    await run(() => exportElementToPdf(document.getElementById("additional-preview"), {
      filename: additionalFilename(renderedAdditional),
      docType: "additional"
    }), { failure: "Could not create that PDF." });
  });
});
