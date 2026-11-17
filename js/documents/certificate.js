// =======================
// CERTIFICATE
// =======================
const certificateForm = document.getElementById("certificate-form");

let renderedCertificate = null;

function buildCertificateIntro(cert) {
  return `
    <h3 class="doc-title">${escapeHtml(String(cert.certType || "").toUpperCase())} CERTIFICATE</h3>
    <p><strong>Patient Name:</strong> ${escapeHtml(cert.patientName)}</p>
    <p><strong>Age / Gender:</strong> ${escapeHtml(cert.age) || "-"} / ${escapeHtml(cert.gender) || "-"}</p>
    <p><strong>Diagnosis:</strong> ${escapeMultiline(cert.diagnosis) || "-"}</p>
    <p><strong>Date:</strong> ${escapeHtml(formatDMY(cert.date))}</p>
  `;
}

function renderCertificatePreview(cert) {
  renderedCertificate = cert;

  // The body is split into paragraphs so the paginator can flow it across
  // sheets. It used to be handed over as one indivisible block, which meant
  // anything past the first page was silently dropped.
  document.getElementById("certificate-preview").innerHTML = buildPaginatedDocument({
    introHtml: buildCertificateIntro(cert),
    outroHtml: renderSignStampBlock({ signBy: cert.signBy, designation: cert.designation }),
    items: splitTextIntoBlocks(cert.body),
    renderItem: text => '<p class="cert-body">' + escapeMultiline(text) + "</p>"
  });

  document.getElementById("certDownloadBtn").style.display = "inline-block";
  document.getElementById("certPrintBtn").style.display = "inline-block";
}

function certificateFilename(cert) {
  const monthYY = String(cert.docNumber || "").split("_")[1] || "";
  return sanitizeFilenamePart(cert.patientName) + "_Certificate_" + monthYY;
}

async function generateCertificatePdf(cert) {
  return exportElementToPdf(document.getElementById("certificate-preview"), {
    filename: certificateFilename(cert),
    docType: "certificate"
  });
}

async function loadCertificateHistory() {
  const result = await run(() => db.documents.toArray("certificate"), {
    failure: "Could not load the certificate history."
  });
  if (!result.ok) return;

  const docs = result.value.slice().sort((a, b) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  const tbody = document.querySelector("#certificateHistoryTable tbody");

  if (docs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-row">No certificates saved yet.</td></tr>';
    return;
  }

  tbody.innerHTML = docs.map(doc =>
    "<tr>" +
      "<td>" + escapeHtml(doc.docNumber) + "</td>" +
      "<td>" + escapeHtml(formatDMY(doc.date)) + "</td>" +
      "<td>" + escapeHtml(doc.patientName || "-") + "</td>" +
      "<td>" + escapeHtml(doc.certType || "-") + "</td>" +
      '<td class="row-actions">' +
        '<button type="button" data-act="view" data-id="' + escapeHtml(doc.docNumber) + '">View</button>' +
        '<button type="button" data-act="edit" data-id="' + escapeHtml(doc.docNumber) + '">Edit</button>' +
        '<button type="button" class="danger" data-act="delete" data-id="' + escapeHtml(doc.docNumber) + '">Delete</button>' +
      "</td>" +
    "</tr>").join("");

  tbody.onclick = async event => {
    const button = event.target.closest("button[data-act]");
    if (!button) return;

    const doc = docs.find(item => item.docNumber === button.dataset.id);
    if (!doc) return;

    if (button.dataset.act === "view") {
      renderCertificatePreview(doc);
      document.getElementById("certificate-preview").scrollIntoView({ behavior: "smooth" });
      return;
    }

    if (button.dataset.act === "edit") {
      loadCertificateIntoForm(doc);
      return;
    }

    if (button.dataset.act === "delete") {
      if (!window.confirm("Delete certificate " + doc.docNumber + "?\n\nThis cannot be undone.")) return;
      const outcome = await run(() => db.documents.remove(doc.docNumber), {
        failure: "Could not delete that certificate."
      });
      if (!outcome.ok) return;
      toast("Certificate " + doc.docNumber + " deleted.", "success");
      await loadCertificateHistory();
      if (typeof loadPatients === "function") await loadPatients();
    }
  };
}

function loadCertificateIntoForm(cert) {
  certificateForm.dataset.editing = cert.docNumber;

  document.getElementById("certPatientType").value = cert.patientType || "OPD";
  document.getElementById("certPatientType").dispatchEvent(new Event("change"));
  if (cert.patientId) document.getElementById("certPatientSelect").value = cert.patientId;

  document.getElementById("certPatientName").value = cert.patientName || "";
  document.getElementById("certAge").value = cert.age || "";
  document.getElementById("certGender").value = cert.gender || "";
  document.getElementById("certDiagnosis").value = cert.diagnosis || "";
  document.getElementById("certType").value = cert.certType || "Fitness";
  document.getElementById("certBody").value = cert.body || "";
  document.getElementById("certDate").value = cert.date || "";
  document.getElementById("certSignBy").value = cert.signBy || "";
  document.getElementById("certDesignation").value = cert.designation || "";

  updateCertEditingBanner();
  certificateForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function clearCertificateForm() {
  delete certificateForm.dataset.editing;
  certificateForm.reset();
  document.getElementById("certPatientType").dispatchEvent(new Event("change"));
  updateCertEditingBanner();
}

function updateCertEditingBanner() {
  const banner = document.getElementById("certEditingBanner");
  if (!banner) return;
  const editing = certificateForm.dataset.editing;
  banner.hidden = !editing;
  if (editing) banner.querySelector("span").textContent = "Editing certificate " + editing;
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("certClearBtn").addEventListener("click", clearCertificateForm);

  document.getElementById("certPatientType").addEventListener("change", event => {
    const isIpd = event.target.value === "IPD";
    document.getElementById("certPatientPicker").style.display = isIpd ? "block" : "none";
    document.getElementById("certOpdNote").style.display = isIpd ? "none" : "block";
  });

  document.getElementById("certPatientSelect").addEventListener("change", async event => {
    if (!event.target.value) return;
    const result = await run(() => db.patients.get(event.target.value), {
      failure: "Could not load that patient."
    });
    const patient = result.value;
    if (!patient) return;

    document.getElementById("certPatientName").value = patient.name || "";
    document.getElementById("certAge").value = patient.age || "";
    document.getElementById("certGender").value = patient.gender || "";
    document.getElementById("certDiagnosis").value = patient.diagnosis || "";
    document.getElementById("certSignBy").value = patient.physio || "";
    event.target.blur();
  });

  certificateForm.addEventListener("submit", async event => {
    event.preventDefault();

    const patientType = document.getElementById("certPatientType").value;
    const patientId = patientType === "IPD"
      ? document.getElementById("certPatientSelect").value
      : null;

    if (patientType === "IPD" && !patientId) {
      toast("Select an IPD patient, or add one under Patients (IPD).", "error");
      return;
    }

    if (!document.getElementById("certBody").value.trim()) {
      toast("Enter the certificate wording.", "error");
      return;
    }

    const editing = certificateForm.dataset.editing;
    const numbered = await run(
      () => (editing ? Promise.resolve(editing) : window.api.nextDocNumber("CERT")),
      { failure: "Could not assign a document number." });
    if (!numbered.ok) return;

    const date = document.getElementById("certDate").value;

    const cert = {
      docType: "certificate",
      docNumber: numbered.value,
      patientType,
      patientId,
      patientName: document.getElementById("certPatientName").value,
      age: document.getElementById("certAge").value,
      gender: document.getElementById("certGender").value,
      diagnosis: document.getElementById("certDiagnosis").value,
      certType: document.getElementById("certType").value,
      body: document.getElementById("certBody").value,
      date,
      signBy: document.getElementById("certSignBy").value,
      designation: document.getElementById("certDesignation").value,
      createdAt: new Date().toISOString()
    };

    const saved = await run(async () => {
      await db.documents.put(cert);
      if (patientType === "IPD" && patientId) {
        await db.patients.linkDocument({
          patientId,
          docType: "certificate",
          docNumber: cert.docNumber,
          date: date || cert.createdAt.slice(0, 10)
        });
        if (typeof loadPatients === "function") await loadPatients();
      }
    }, { failure: "The certificate could not be saved." });

    if (!saved.ok) return;

    renderCertificatePreview(cert);

    const pdf = await run(() => generateCertificatePdf(cert), {
      failure: "The certificate was saved, but the PDF could not be created."
    });

    await loadCertificateHistory();
    delete certificateForm.dataset.editing;
    updateCertEditingBanner();

    if (pdf.ok) {
      toast("Certificate " + cert.docNumber + " saved. PDF downloaded: " + pdf.value, "success", 6000);
    }
  });

  document.getElementById("certDownloadBtn").addEventListener("click", async () => {
    if (!renderedCertificate) return;
    await run(() => generateCertificatePdf(renderedCertificate), {
      failure: "Could not create that PDF."
    });
  });

  document.getElementById("certPrintBtn").addEventListener("click", () => {
    if (!renderedCertificate) return;
    printElement(document.getElementById("certificate-preview"), {
      title: certificateFilename(renderedCertificate)
    });
  });

  loadCertificateHistory();
});
