// Shared header/footer for non-invoice documents (Treatment Protocol, Certificate, ...)
// First page gets the full branded blue-band header; continuation pages get a plain text header.
// All clinic details come from js/config/clinic.js.

function renderDocHeader(options) {
  const first = options && options.first;

  if (first) {
    const addressHtml = CLINIC.addressLines
      .map(line => "<p>" + escapeHtml(line) + "</p>")
      .join("");

    return `
      <div class="doc-header doc-header-first">
        <img src="assets/logo.png" class="doc-logo" alt="" />
        <div class="doc-header-text">
          <h2>${escapeHtml(CLINIC.name)}</h2>
          ${addressHtml}
          <p>PAN: ${escapeHtml(CLINIC.pan)}, UDYAM: ${escapeHtml(CLINIC.udyam)} Ph: ${escapeHtml(CLINIC.phone)}</p>
          <p>E-mail: ${escapeHtml(CLINIC.email)} Web: ${escapeHtml(CLINIC.web)} Insta: ${escapeHtml(CLINIC.instagram)}</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="doc-header doc-header-continuation">
      <p>${escapeHtml(CLINIC.namePlain)}</p>
    </div>
  `;
}

// Shared sign + stamp block for the end of any non-invoice document.
function renderSignStampBlock(options) {
  const opts = options || {};
  const signBy = escapeHtml(opts.signBy) || "-";
  const designation = opts.designation
    ? `<p class="designation">${escapeHtml(opts.designation)}</p>`
    : "";

  return `
    <div class="sign-stamp-block">
      <div class="sign-line">
        <p><strong>Sign by:</strong> ${signBy}</p>
        ${designation}
      </div>
      <div class="stamp-box">Stamp</div>
    </div>
    <p class="stamp-note">This document is not valid without the sign and stamp of an authorized person.</p>
  `;
}
