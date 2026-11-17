// One place for everything to do with turning a preview into paper or a PDF.
// Previously the three generators each carried their own copy of these options
// and the two print buttons each had their own nested-setTimeout dance.

// html2canvas renders the preview to a bitmap, so the scale factor decides both
// the output resolution and the peak memory use. The old hardcoded scale of 3
// meant ~2480x3508px per A4 sheet (roughly 35MB of canvas per page), which is a
// large part of why the app crawled on the clinic's 4GB PC and would kill a
// phone tab. Scale 2 is still about 190 DPI -- well beyond what an invoice or a
// protocol needs on paper.
function pdfCanvasScale() {
  const narrow = window.matchMedia && window.matchMedia("(max-width: 820px)").matches;
  if (narrow) return 1.5;

  // Chromium exposes approximate device RAM in GiB.
  const memory = navigator.deviceMemory;
  if (typeof memory === "number" && memory <= 4) return 1.5;

  return 2;
}

function pdfOptions(filename, options) {
  const opts = options || {};
  return {
    margin: 0,
    filename: filename + ".pdf",
    image: { type: "jpeg", quality: 0.95 },
    html2canvas: {
      scale: pdfCanvasScale(),
      backgroundColor: "#ffffff",
      logging: false,
      useCORS: true
    },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait", compress: true },
    // "css" honours the page-break rules on .doc-page; without this the invoice
    // had no page-break handling at all and a long one simply overflowed.
    pagebreak: opts.paginate === false ? { mode: [] } : { mode: ["css", "legacy"] }
  };
}

// On a phone the 210mm-wide previews are shown scaled down to fit. That
// transform has to come off before html2canvas measures the element, or the
// captured bitmap inherits the scaling.
async function withoutPreviewFit(el, work) {
  const wrapper = el.closest ? el.closest(".preview-scroll") : null;
  const wasFit = wrapper && wrapper.classList.contains("fit");
  if (wasFit) wrapper.classList.remove("fit");
  try {
    return await work();
  } finally {
    if (wasFit) wrapper.classList.add("fit");
  }
}

// Scales each 210mm-wide preview down to the width of a phone screen. Uses
// `zoom` rather than `transform` so the wrapper's own height follows along and
// the page does not end up with a tall empty gap under a shrunken preview.
function syncPreviewFit() {
  const narrow = window.matchMedia("(max-width: 820px)").matches;

  document.querySelectorAll(".preview-scroll").forEach(wrapper => {
    if (!narrow) {
      wrapper.classList.remove("fit");
      wrapper.style.removeProperty("--preview-zoom");
      return;
    }

    const inner = wrapper.firstElementChild;
    if (!inner || inner.offsetParent === null) return;

    // Measured with the zoom off, so the natural 210mm width is what is read.
    wrapper.classList.remove("fit");
    const naturalWidth = inner.offsetWidth;
    wrapper.classList.add("fit");
    if (!naturalWidth) return;

    const available = wrapper.clientWidth - 4;
    const zoom = Math.min(1, available / naturalWidth);
    wrapper.style.setProperty("--preview-zoom", zoom.toFixed(4));
  });
}

document.addEventListener("DOMContentLoaded", () => {
  syncPreviewFit();
  window.addEventListener("resize", syncPreviewFit);

  // A preview is empty (and therefore hidden) until something is rendered into
  // it, so the zoom has to be recalculated when its content appears.
  document.querySelectorAll(".preview-scroll").forEach(wrapper => {
    new MutationObserver(syncPreviewFit).observe(wrapper, { childList: true, subtree: true });
  });
});

async function exportElementToPdf(el, options) {
  const filename = options.filename;
  const docType = options.docType;

  return withoutPreviewFit(el, async () => {
    const opt = pdfOptions(filename, { paginate: options.paginate !== false });
    const pdf = await html2pdf().set(opt).from(el).toPdf().get("pdf");
    const arrayBuffer = pdf.output("arraybuffer");
    return window.api.savePdf(new Uint8Array(arrayBuffer), docType, filename);
  });
}

// =======================
// PRINTING
// =======================
// The old approach hid the app with `visibility: hidden` and positioned the
// preview absolutely. Hidden elements still take up layout space, so the whole
// invoice form kept its height and produced one or two extra sheets that came
// out blank. Here the element being printed is moved into #print-root and every
// other direct child of <body> is removed from layout with `display: none`, so
// the browser lays out exactly the pages that have content on them.
function ensurePrintRoot() {
  let root = document.getElementById("print-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "print-root";
    document.body.appendChild(root);
  }
  return root;
}

// Puts the page into its print layout and returns the function that undoes it.
// Split out from printElement so the test harness can exercise exactly this
// layout through printToPDF without opening a print dialog.
function beginPrintLayout(el, title) {
  const root = ensurePrintRoot();

  // Marks where the element came from so it can be put back exactly there.
  const placeholder = document.createElement("span");
  placeholder.className = "print-placeholder";
  el.parentNode.insertBefore(placeholder, el);
  root.appendChild(el);

  el.classList.add("print-target");
  document.body.classList.add("printing");

  const previousTitle = document.title;
  if (title) document.title = title;

  let restored = false;
  return function restore() {
    if (restored) return;
    restored = true;
    document.body.classList.remove("printing");
    el.classList.remove("print-target");
    if (placeholder.parentNode) {
      placeholder.parentNode.insertBefore(el, placeholder);
      placeholder.remove();
    }
    document.title = previousTitle;
  };
}

function printElement(el, options) {
  const opts = options || {};
  const restore = beginPrintLayout(el, opts.title);

  // Chromium blocks on window.print() until the dialog closes, so restoring
  // straight after it returns is correct; afterprint covers browsers that do
  // not block, and restore() is idempotent so a double call is harmless.
  window.addEventListener("afterprint", restore, { once: true });
  requestAnimationFrame(() => {
    try {
      window.print();
    } finally {
      restore();
    }
  });
}
