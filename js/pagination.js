// Splits a list of items across A4 "doc-page" blocks, each carrying the correct
// doc header (full banner on page 1, plain text after). Consumed by html2pdf's
// CSS page-break mode and by the print stylesheet.
//
// This used to chunk by a hardcoded item count (20 on the first page, 35 after),
// which assumed every item was exactly one line tall. A protocol with exercise
// names long enough to wrap, or a certificate body of any real length, simply
// overflowed the sheet and the overflow was silently dropped from the PDF.
// Pages are now filled by measuring what actually fits.

// 296mm rather than a full 297mm: the 1mm of slack means sub-pixel rounding in
// the PDF renderer can never push a sliver onto an extra sheet.
const PAGE_HEIGHT_MM = 296;

let measureHostEl = null;
let pageHeightPxCache = null;

function ensureMeasureHost() {
  if (measureHostEl && measureHostEl.isConnected) return measureHostEl;
  measureHostEl = document.createElement("div");
  measureHostEl.id = "pagination-measure";
  measureHostEl.setAttribute("aria-hidden", "true");
  document.body.appendChild(measureHostEl);
  return measureHostEl;
}

// Measured once from a real element so it tracks the browser's own mm->px
// conversion instead of assuming 96dpi.
function pageHeightPx() {
  if (pageHeightPxCache !== null) return pageHeightPxCache;
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;visibility:hidden;height:" + PAGE_HEIGHT_MM + "mm;";
  document.body.appendChild(probe);
  pageHeightPxCache = probe.offsetHeight;
  probe.remove();
  return pageHeightPxCache;
}

function buildPaginatedDocument(config) {
  const introHtml = config.introHtml || "";
  const outroHtml = config.outroHtml || "";
  const items = Array.isArray(config.items) ? config.items : [];
  const renderItem = config.renderItem || (item => String(item));

  const host = ensureMeasureHost();
  host.innerHTML = "";

  const limit = pageHeightPx();

  let page = null;
  let content = null;
  let pagesStarted = 0;
  let itemsOnPage = 0;
  let pageHasIntro = false;

  function startPage() {
    const isFirst = pagesStarted === 0;
    host.insertAdjacentHTML("beforeend",
      '<div class="doc-page">' +
        renderDocHeader({ first: isFirst }) +
        '<div class="doc-page-content">' + (isFirst ? introHtml : "") + "</div>" +
      "</div>");

    page = host.lastElementChild;
    content = page.querySelector(".doc-page-content");
    pagesStarted++;
    itemsOnPage = 0;
    pageHasIntro = isFirst && introHtml !== "";
  }

  function appendHtml(html) {
    content.insertAdjacentHTML("beforeend", html);
    return content.lastElementChild;
  }

  startPage();

  items.forEach(item => {
    const html = renderItem(item);
    appendHtml(html);
    itemsOnPage++;

    if (page.offsetHeight <= limit) return;

    // An item that is alone on a page with nothing else on it cannot be helped
    // by moving it again, so leave it rather than loop forever.
    const aloneOnBarePage = !pageHasIntro && itemsOnPage === 1;
    if (aloneOnBarePage) return;

    content.lastElementChild.remove();
    startPage();
    appendHtml(html);
    itemsOnPage = 1;
  });

  if (outroHtml) {
    const wrapped = '<div class="doc-outro">' + outroHtml + "</div>";
    appendHtml(wrapped);
    if (page.offsetHeight > limit) {
      content.lastElementChild.remove();
      startPage();
      appendHtml(wrapped);
    }
  }

  const html = host.innerHTML;
  host.innerHTML = "";
  return html;
}

// Splits free text into page-flowable blocks: blank lines separate paragraphs,
// and single newlines inside a paragraph are kept as line breaks. Used by the
// certificate and additional-document bodies, which were previously handed to
// the paginator as one indivisible blob that could not be split at all.
function splitTextIntoBlocks(text) {
  return String(text || "")
    .split(/\r?\n\s*\r?\n/)
    .map(block => block.trim())
    .filter(Boolean);
}
