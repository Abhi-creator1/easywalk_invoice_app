// The invoice preview's letterhead, declaration and footer used to be static
// markup inside index.html, which is how its clinic details drifted out of step
// with the ones in the document header (different Instagram handle, a stray
// duplicated "Therapy"). All three now render from js/config/clinic.js.

function renderInvoiceChrome() {
  const header = document.getElementById("p-invoiceHeader");
  if (header) {
    header.innerHTML = `
      <div class="invoice-header-left">
        <img src="assets/logo.png" class="invoice-logo" alt="" />
        <div>
          <h2>${escapeHtml(CLINIC.brand)}</h2>
          <p>${escapeHtml(CLINIC.tagline)}</p>
        </div>
      </div>
      <div class="invoice-title">INVOICE</div>
    `;
  }

  const declaration = document.getElementById("p-declaration");
  if (declaration) {
    declaration.innerHTML = `
      <p>We declare that Physiotherapy Treatment has been undertaken at our Rehabilitation Centre.</p>
      <p>We declare that the invoice shows actual price and that all particulars herein are true and correct.</p>
      <br />
      <strong>${escapeHtml(CLINIC.signatory)}</strong><br /><br />
      <br />
      (Proprietor / Authorised Signatory)
    `;
  }

  const footer = document.getElementById("p-invoiceFooter");
  if (footer) {
    const address = CLINIC.addressLines.map(line => escapeHtml(line)).join("<br />");
    footer.innerHTML = `
      ${escapeHtml(CLINIC.namePlain)},<br />
      ${address}<br />
      PAN: ${escapeHtml(CLINIC.pan)}, UDYAM: ${escapeHtml(CLINIC.udyam)}<br />
      Ph: ${escapeHtml(CLINIC.phone)}, E-mail: ${escapeHtml(CLINIC.email)}<br />
      Web: ${escapeHtml(CLINIC.web)}, Insta: @${escapeHtml(CLINIC.instagram)}
    `;
  }
}

document.addEventListener("DOMContentLoaded", renderInvoiceChrome);
