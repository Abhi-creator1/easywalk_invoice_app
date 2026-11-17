// Splits a list into page-sized chunks and assembles an A4 "page" per chunk,
// each carrying the correct doc header (full banner on page 1, plain text after).
// Consumed by html2pdf's CSS page-break mode.
function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function buildPaginatedDocument({ introHtml, outroHtml, items, renderItem, itemsFirstPage, itemsPerPage, listWrapper }) {
  const firstChunkSize = Math.max(itemsFirstPage, 0);
  const firstChunk = items.slice(0, firstChunkSize);
  const restChunks = chunkArray(items.slice(firstChunkSize), itemsPerPage);
  const pagesItems = items.length ? [firstChunk, ...restChunks] : [[]];

  return pagesItems
    .map((pageItems, pageIndex) => {
      const isFirst = pageIndex === 0;
      const isLast = pageIndex === pagesItems.length - 1;
      const body = pageItems.map(renderItem).join("");

      return `
        <div class="doc-page">
          ${renderDocHeader({ first: isFirst })}
          <div class="doc-page-content">
            ${isFirst ? introHtml : ""}
            ${listWrapper ? listWrapper(body, isFirst) : body}
            ${isLast && outroHtml ? outroHtml : ""}
          </div>
        </div>
      `;
    })
    .join("");
}
