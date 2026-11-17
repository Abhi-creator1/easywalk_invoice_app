// Shared header/footer for non-invoice documents (Treatment Protocol, Certificate, ...)
// First page gets the full branded blue-band header; continuation pages get a plain text header.
const CLINIC_NAME = "EASYWALK PHYSIOTHERAPY AND REHABILITATION CENTRE";
const CLINIC_NAME_PLAIN = "EasyWalk Physiotherapy and Rehabilitation Centre";

function renderDocHeader({ first }) {
  if (first) {
    return `
      <div class="doc-header doc-header-first">
        <img src="assets/logo.png" class="doc-logo" />
        <div class="doc-header-text">
          <h2>${CLINIC_NAME}</h2>
          <p>Add: Prabhu Business Centre, Ravishankar Marg, Wadala, Nashik, 422006,</p>
          <p>PAN: KFJPS7319J, UDYAM: MH-23-0153661 Ph: +91 7972187511, Web: https://easywalkphysiorehab.com</p>
          <p>E-mail: easywalkrehabnsk@gmail.com Insta: easywalk_physio_rehabilitation</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="doc-header doc-header-continuation">
      <p>${CLINIC_NAME_PLAIN}</p>
    </div>
  `;
}

// Shared sign + stamp block for the end of any non-invoice document.
function renderSignStampBlock({ signBy, designation }) {
  return `
    <div class="sign-stamp-block">
      <div class="sign-line">
        <p><strong>Sign by:</strong> ${escapeHtml(signBy) || "-"}</p>
        ${designation ? `<p class="designation">${escapeHtml(designation)}</p>` : ""}
      </div>
      <div class="stamp-box">Stamp</div>
    </div>
    <p class="stamp-note">This document is not valid without the sign and stamp of an authorized person.</p>
  `;
}
