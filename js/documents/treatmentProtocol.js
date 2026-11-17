// =======================
// TREATMENT PROTOCOL
// =======================
const protocolTableBody = document.querySelector("#protocolTable tbody");

function escapeHtml(str) {
  const div = document.createElement("div");
  div.innerText = str || "";
  return div.innerHTML;
}

function addExerciseRow(value) {
  const row = document.createElement("tr");
  const rowNum = protocolTableBody.children.length + 1;

  row.innerHTML = `
    <td class="row-num">${rowNum}</td>
    <td><input type="text" class="exercise-name" value="${value ? escapeHtml(value) : ""}" placeholder="Exercise name" /></td>
    <td><button type="button" class="remove">✕</button></td>
  `;

  row.querySelector(".remove").addEventListener("click", () => {
    row.remove();
    renumberExerciseRows();
  });

  protocolTableBody.appendChild(row);
}

function renumberExerciseRows() {
  [...protocolTableBody.children].forEach((row, idx) => {
    row.querySelector(".row-num").innerText = idx + 1;
  });
}

function getExerciseList() {
  return [...protocolTableBody.querySelectorAll(".exercise-name")]
    .map(input => input.value.trim())
    .filter(Boolean);
}

function buildProtocolIntro(protocol) {
  return `
    <h3 class="doc-title">PATIENT TREATMENT PROTOCOL</h3>
    <p><strong>Patient Name:</strong> ${escapeHtml(protocol.patientName)}</p>
    <p><strong>Age / Gender:</strong> ${escapeHtml(protocol.age) || "-"} / ${escapeHtml(protocol.gender) || "-"}</p>
    <p><strong>Address:</strong> ${escapeHtml(protocol.address) || "-"}</p>
    <p><strong>Diagnosis:</strong> ${escapeHtml(protocol.diagnosis) || "-"}</p>
    <p><strong>Date of Assessment:</strong> ${escapeHtml(protocol.assessmentDate) || "-"}</p>
    <p><strong>Treating Physiotherapist:</strong> ${escapeHtml(protocol.physio) || "-"}</p>
    <p style="margin-top:10px;">The following treatment protocol has been prescribed by the treating physiotherapist based on the patient's clinical assessment, diagnosis, and functional status.</p>
    <h4 style="margin-top:10px;">Prescribed Treatment Protocol</h4>
  `;
}

function renderProtocolPreview(protocol) {
  const items = protocol.exercises.map((text, i) => ({ n: i + 1, text }));

  const html = buildPaginatedDocument({
    introHtml: buildProtocolIntro(protocol),
    outroHtml: renderSignStampBlock({ signBy: protocol.signBy, designation: protocol.designation }),
    items,
    renderItem: item => `<div class="protocol-item">${item.n}. ${escapeHtml(item.text)}</div>`,
    itemsFirstPage: 20,
    itemsPerPage: 35
  });

  document.getElementById("protocol-preview").innerHTML = html;
  document.getElementById("protocol-preview").dataset.docNumber = protocol.docNumber;
  document.getElementById("protocol-preview").dataset.patientName = protocol.patientName;
  document.getElementById("protocolDownloadBtn").style.display = "inline-block";
}

async function generateProtocolPdf(protocol) {
  const el = document.getElementById("protocol-preview");
  const monthYY = protocol.docNumber.split("_")[1];
  const filename = `${sanitizeFilenamePart(protocol.patientName)}_Protocol_${monthYY}`;

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
  await window.api.savePdf(new Uint8Array(arrayBuffer), "protocol", filename);
}

async function loadProtocolHistory() {
  const docs = await db.documents.toArray("protocol");
  const tbody = document.querySelector("#protocolHistoryTable tbody");
  tbody.innerHTML = "";

  docs.forEach(doc => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${doc.docNumber}</td>
      <td>${doc.assessmentDate || "-"}</td>
      <td>${doc.patientName}</td>
      <td>${doc.patientType}</td>
      <td><button type="button" data-id="${doc.docNumber}">View</button></td>
    `;
    row.querySelector("button").addEventListener("click", () => {
      renderProtocolPreview(doc);
      document.getElementById("protocol-preview").scrollIntoView({ behavior: "smooth" });
    });
    tbody.appendChild(row);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  addExerciseRow();

  document.getElementById("addExerciseBtn").addEventListener("click", () => addExerciseRow());

  document.getElementById("protocolPatientType").addEventListener("change", e => {
    const isIpd = e.target.value === "IPD";
    document.getElementById("protocolPatientPicker").style.display = isIpd ? "block" : "none";
    document.getElementById("protocolOpdNote").style.display = isIpd ? "none" : "block";
  });

  document.getElementById("protocolPatientSelect").addEventListener("change", async e => {
    const patient = await db.patients.get(e.target.value);
    if (!patient) return;
    document.getElementById("protocolPatientName").value = patient.name || "";
    document.getElementById("protocolAge").value = patient.age || "";
    document.getElementById("protocolGender").value = patient.gender || "";
    document.getElementById("protocolAddress").value = patient.address || "";
    document.getElementById("protocolDiagnosis").value = patient.diagnosis || "";
    document.getElementById("protocolPhysio").value = patient.physio || "";
    e.target.blur();
  });

  document.getElementById("protocol-form").addEventListener("submit", async e => {
    e.preventDefault();

    const patientType = document.getElementById("protocolPatientType").value;
    const patientId = patientType === "IPD" ? document.getElementById("protocolPatientSelect").value : null;

    if (patientType === "IPD" && !patientId) {
      alert("Please select an IPD patient, or add one under Patients (IPD).");
      return;
    }

    const exercises = getExerciseList();
    if (exercises.length === 0) {
      alert("Add at least one exercise.");
      return;
    }

    const docNumber = await window.api.nextDocNumber("TP");
    const assessmentDate = document.getElementById("protocolAssessmentDate").value;

    const protocol = {
      docType: "protocol",
      docNumber,
      patientType,
      patientId,
      patientName: document.getElementById("protocolPatientName").value,
      age: document.getElementById("protocolAge").value,
      gender: document.getElementById("protocolGender").value,
      address: document.getElementById("protocolAddress").value,
      diagnosis: document.getElementById("protocolDiagnosis").value,
      assessmentDate,
      physio: document.getElementById("protocolPhysio").value,
      signBy: document.getElementById("protocolSignBy").value,
      designation: document.getElementById("protocolDesignation").value,
      exercises,
      createdAt: new Date().toISOString()
    };

    await db.documents.put(protocol);

    if (patientType === "IPD" && patientId) {
      await db.patients.linkDocument({
        patientId,
        docType: "protocol",
        docNumber,
        date: assessmentDate || protocol.createdAt.slice(0, 10)
      });
      await loadPatients();
    }

    renderProtocolPreview(protocol);
    await generateProtocolPdf(protocol);
    await loadProtocolHistory();

    alert("Treatment protocol saved and PDF exported ✅");
  });

  document.getElementById("protocolDownloadBtn").addEventListener("click", async () => {
    const preview = document.getElementById("protocol-preview");
    if (preview.dataset.docNumber) {
      await generateProtocolPdf({ docNumber: preview.dataset.docNumber, patientName: preview.dataset.patientName });
    }
  });

  loadProtocolHistory();
});
