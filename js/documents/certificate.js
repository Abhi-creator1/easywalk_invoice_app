// =======================
// CERTIFICATE
// =======================
function buildCertificateIntro(cert) {
  return `
    <h3 class="doc-title">${cert.certType.toUpperCase()} CERTIFICATE</h3>
    <p><strong>Patient Name:</strong> ${escapeHtml(cert.patientName)}</p>
    <p><strong>Age / Gender:</strong> ${escapeHtml(cert.age) || "-"} / ${escapeHtml(cert.gender) || "-"}</p>
    <p><strong>Diagnosis:</strong> ${escapeHtml(cert.diagnosis) || "-"}</p>
    <p><strong>Date:</strong> ${escapeHtml(cert.date) || "-"}</p>
  `;
}

function renderCertificatePreview(cert) {
  const html = buildPaginatedDocument({
    introHtml: buildCertificateIntro(cert),
    outroHtml: renderSignStampBlock({ signBy: cert.signBy, designation: cert.designation }),
    items: [cert.body],
    renderItem: text => `<p class="cert-body">${escapeHtml(text).replace(/\n/g, "<br/>")}</p>`,
    itemsFirstPage: 1,
    itemsPerPage: 1
  });

  document.getElementById("certificate-preview").innerHTML = html;
  document.getElementById("certificate-preview").dataset.docNumber = cert.docNumber;
  document.getElementById("certificate-preview").dataset.patientName = cert.patientName;
  document.getElementById("certDownloadBtn").style.display = "inline-block";
}

async function generateCertificatePdf(cert) {
  const el = document.getElementById("certificate-preview");
  const monthYY = cert.docNumber.split("_")[1];
  const filename = `${sanitizeFilenamePart(cert.patientName)}_Certificate_${monthYY}`;

  const opt = {
    margin: 0,
    filename: `${filename}.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 3 },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: "css" }
  };

  const pdf = await html2pdf().set(opt).from(el).toPdf().get("pdf");
  const arrayBuffer = pdf.output("arraybuffer");
  await window.api.savePdf(new Uint8Array(arrayBuffer), "certificate", filename);
}

async function loadCertificateHistory() {
  const docs = await db.documents.toArray("certificate");
  const tbody = document.querySelector("#certificateHistoryTable tbody");
  tbody.innerHTML = "";

  docs.forEach(doc => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${doc.docNumber}</td>
      <td>${doc.date || "-"}</td>
      <td>${doc.patientName}</td>
      <td>${doc.certType}</td>
      <td><button type="button" data-id="${doc.docNumber}">View</button></td>
    `;
    row.querySelector("button").addEventListener("click", () => {
      renderCertificatePreview(doc);
      document.getElementById("certificate-preview").scrollIntoView({ behavior: "smooth" });
    });
    tbody.appendChild(row);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("certPatientType").addEventListener("change", e => {
    const isIpd = e.target.value === "IPD";
    document.getElementById("certPatientPicker").style.display = isIpd ? "block" : "none";
    document.getElementById("certOpdNote").style.display = isIpd ? "none" : "block";
  });

  document.getElementById("certPatientSelect").addEventListener("change", async e => {
    const patient = await db.patients.get(e.target.value);
    if (!patient) return;
    document.getElementById("certPatientName").value = patient.name || "";
    document.getElementById("certAge").value = patient.age || "";
    document.getElementById("certGender").value = patient.gender || "";
    document.getElementById("certDiagnosis").value = patient.diagnosis || "";
    document.getElementById("certSignBy").value = patient.physio || "";
    e.target.blur();
  });

  document.getElementById("certificate-form").addEventListener("submit", async e => {
    e.preventDefault();

    const patientType = document.getElementById("certPatientType").value;
    const patientId = patientType === "IPD" ? document.getElementById("certPatientSelect").value : null;

    if (patientType === "IPD" && !patientId) {
      alert("Please select an IPD patient, or add one under Patients (IPD).");
      return;
    }

    const docNumber = await window.api.nextDocNumber("CERT");
    const date = document.getElementById("certDate").value;

    const cert = {
      docType: "certificate",
      docNumber,
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

    await db.documents.put(cert);

    if (patientType === "IPD" && patientId) {
      await db.patients.linkDocument({
        patientId,
        docType: "certificate",
        docNumber,
        date: date || cert.createdAt.slice(0, 10)
      });
      await loadPatients();
    }

    renderCertificatePreview(cert);
    await generateCertificatePdf(cert);
    await loadCertificateHistory();

    alert("Certificate saved and PDF exported ✅");
  });

  document.getElementById("certDownloadBtn").addEventListener("click", async () => {
    const preview = document.getElementById("certificate-preview");
    if (preview.dataset.docNumber) {
      await generateCertificatePdf({ docNumber: preview.dataset.docNumber, patientName: preview.dataset.patientName });
    }
  });

  loadCertificateHistory();
});
