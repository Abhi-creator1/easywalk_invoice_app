// =======================
// TREATMENT PROTOCOL
// =======================
const protocolForm = document.getElementById("protocol-form");
const protocolTableBody = document.querySelector("#protocolTable tbody");

// The protocol currently shown in the preview, so the Download button can
// re-export it without rebuilding anything from the DOM.
let renderedProtocol = null;

function addExerciseRow(value) {
  const row = document.createElement("tr");

  row.innerHTML = `
    <td class="row-num"></td>
    <td><input type="text" class="exercise-name" placeholder="Exercise name" /></td>
    <td><button type="button" class="remove" aria-label="Remove this exercise">&#10005;</button></td>
  `;

  row.querySelector(".exercise-name").value = value || "";

  row.querySelector(".remove").addEventListener("click", () => {
    row.remove();
    if (protocolTableBody.children.length === 0) addExerciseRow();
    renumberExerciseRows();
  });

  protocolTableBody.appendChild(row);
  renumberExerciseRows();
}

function renumberExerciseRows() {
  [...protocolTableBody.children].forEach((row, index) => {
    row.querySelector(".row-num").innerText = index + 1;
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
    <p><strong>Address:</strong> ${escapeMultiline(protocol.address) || "-"}</p>
    <p><strong>Diagnosis:</strong> ${escapeMultiline(protocol.diagnosis) || "-"}</p>
    <p><strong>Date of Assessment:</strong> ${escapeHtml(formatDMY(protocol.assessmentDate))}</p>
    <p><strong>Treating Physiotherapist:</strong> ${escapeHtml(protocol.physio) || "-"}</p>
    <p style="margin-top:10px;">The following treatment protocol has been prescribed by the treating physiotherapist based on the patient's clinical assessment, diagnosis, and functional status.</p>
    <h4 style="margin-top:10px;">Prescribed Treatment Protocol</h4>
  `;
}

function renderProtocolPreview(protocol) {
  renderedProtocol = protocol;

  const items = (protocol.exercises || []).map((text, index) => ({ n: index + 1, text }));

  document.getElementById("protocol-preview").innerHTML = buildPaginatedDocument({
    introHtml: buildProtocolIntro(protocol),
    outroHtml: renderSignStampBlock({ signBy: protocol.signBy, designation: protocol.designation }),
    items,
    renderItem: item =>
      '<div class="protocol-item">' + item.n + ". " + escapeHtml(item.text) + "</div>"
  });

  document.getElementById("protocolDownloadBtn").style.display = "inline-block";
  document.getElementById("protocolPrintBtn").style.display = "inline-block";
}

function protocolFilename(protocol) {
  const monthYY = String(protocol.docNumber || "").split("_")[1] || "";
  return sanitizeFilenamePart(protocol.patientName) + "_Protocol_" + monthYY;
}

async function generateProtocolPdf(protocol) {
  return exportElementToPdf(document.getElementById("protocol-preview"), {
    filename: protocolFilename(protocol),
    docType: "protocol"
  });
}

async function loadProtocolHistory() {
  const result = await run(() => db.documents.toArray("protocol"), {
    failure: "Could not load the protocol history."
  });
  if (!result.ok) return;

  const docs = result.value.slice().sort((a, b) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  const tbody = document.querySelector("#protocolHistoryTable tbody");

  if (docs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-row">No protocols saved yet.</td></tr>';
    return;
  }

  tbody.innerHTML = docs.map(doc =>
    "<tr>" +
      "<td>" + escapeHtml(doc.docNumber) + "</td>" +
      "<td>" + escapeHtml(formatDMY(doc.assessmentDate)) + "</td>" +
      "<td>" + escapeHtml(doc.patientName || "-") + "</td>" +
      "<td>" + escapeHtml(doc.patientType || "-") + "</td>" +
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
      renderProtocolPreview(doc);
      document.getElementById("protocol-preview").scrollIntoView({ behavior: "smooth" });
      return;
    }

    if (button.dataset.act === "edit") {
      loadProtocolIntoForm(doc);
      return;
    }

    if (button.dataset.act === "delete") {
      if (!window.confirm("Delete protocol " + doc.docNumber + "?\n\nThis cannot be undone.")) return;
      const outcome = await run(() => db.documents.remove(doc.docNumber), {
        failure: "Could not delete that protocol."
      });
      if (!outcome.ok) return;
      toast("Protocol " + doc.docNumber + " deleted.", "success");
      await loadProtocolHistory();
      if (typeof loadPatients === "function") await loadPatients();
    }
  };
}

function loadProtocolIntoForm(protocol) {
  protocolForm.dataset.editing = protocol.docNumber;

  document.getElementById("protocolPatientType").value = protocol.patientType || "OPD";
  document.getElementById("protocolPatientType").dispatchEvent(new Event("change"));
  if (protocol.patientId) document.getElementById("protocolPatientSelect").value = protocol.patientId;

  document.getElementById("protocolPatientName").value = protocol.patientName || "";
  document.getElementById("protocolAge").value = protocol.age || "";
  document.getElementById("protocolGender").value = protocol.gender || "";
  document.getElementById("protocolAddress").value = protocol.address || "";
  document.getElementById("protocolDiagnosis").value = protocol.diagnosis || "";
  document.getElementById("protocolAssessmentDate").value = protocol.assessmentDate || "";
  document.getElementById("protocolPhysio").value = protocol.physio || "";
  document.getElementById("protocolSignBy").value = protocol.signBy || "";
  document.getElementById("protocolDesignation").value = protocol.designation || "";

  protocolTableBody.innerHTML = "";
  const exercises = (protocol.exercises || []).length ? protocol.exercises : [""];
  exercises.forEach(addExerciseRow);

  updateProtocolEditingBanner();
  protocolForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function clearProtocolForm() {
  delete protocolForm.dataset.editing;
  protocolForm.reset();
  protocolTableBody.innerHTML = "";
  addExerciseRow();
  document.getElementById("protocolPatientType").dispatchEvent(new Event("change"));
  updateProtocolEditingBanner();
}

function updateProtocolEditingBanner() {
  const banner = document.getElementById("protocolEditingBanner");
  if (!banner) return;
  const editing = protocolForm.dataset.editing;
  banner.hidden = !editing;
  if (editing) banner.querySelector("span").textContent = "Editing protocol " + editing;
}

document.addEventListener("DOMContentLoaded", () => {
  addExerciseRow();

  document.getElementById("addExerciseBtn").addEventListener("click", () => addExerciseRow());
  document.getElementById("protocolClearBtn").addEventListener("click", clearProtocolForm);

  document.getElementById("protocolPatientType").addEventListener("change", event => {
    const isIpd = event.target.value === "IPD";
    document.getElementById("protocolPatientPicker").style.display = isIpd ? "block" : "none";
    document.getElementById("protocolOpdNote").style.display = isIpd ? "none" : "block";
  });

  document.getElementById("protocolPatientSelect").addEventListener("change", async event => {
    if (!event.target.value) return;
    const result = await run(() => db.patients.get(event.target.value), {
      failure: "Could not load that patient."
    });
    const patient = result.value;
    if (!patient) return;

    document.getElementById("protocolPatientName").value = patient.name || "";
    document.getElementById("protocolAge").value = patient.age || "";
    document.getElementById("protocolGender").value = patient.gender || "";
    document.getElementById("protocolAddress").value = patient.address || "";
    document.getElementById("protocolDiagnosis").value = patient.diagnosis || "";
    document.getElementById("protocolPhysio").value = patient.physio || "";
    event.target.blur();
  });

  protocolForm.addEventListener("submit", async event => {
    event.preventDefault();

    const patientType = document.getElementById("protocolPatientType").value;
    const patientId = patientType === "IPD"
      ? document.getElementById("protocolPatientSelect").value
      : null;

    if (patientType === "IPD" && !patientId) {
      toast("Select an IPD patient, or add one under Patients (IPD).", "error");
      return;
    }

    const exercises = getExerciseList();
    if (exercises.length === 0) {
      toast("Add at least one exercise.", "error");
      return;
    }

    const editing = protocolForm.dataset.editing;
    const numbered = await run(
      () => (editing ? Promise.resolve(editing) : window.api.nextDocNumber("TP")),
      { failure: "Could not assign a document number." });
    if (!numbered.ok) return;

    const assessmentDate = document.getElementById("protocolAssessmentDate").value;

    const protocol = {
      docType: "protocol",
      docNumber: numbered.value,
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

    const saved = await run(async () => {
      await db.documents.put(protocol);
      if (patientType === "IPD" && patientId) {
        await db.patients.linkDocument({
          patientId,
          docType: "protocol",
          docNumber: protocol.docNumber,
          date: assessmentDate || protocol.createdAt.slice(0, 10)
        });
        if (typeof loadPatients === "function") await loadPatients();
      }
    }, { failure: "The protocol could not be saved." });

    if (!saved.ok) return;

    renderProtocolPreview(protocol);

    const pdf = await run(() => generateProtocolPdf(protocol), {
      failure: "The protocol was saved, but the PDF could not be created."
    });

    await loadProtocolHistory();
    delete protocolForm.dataset.editing;
    updateProtocolEditingBanner();

    if (pdf.ok) {
      toast("Protocol " + protocol.docNumber + " saved. PDF downloaded: " + pdf.value, "success", 6000);
    }
  });

  document.getElementById("protocolDownloadBtn").addEventListener("click", async () => {
    if (!renderedProtocol) return;
    await run(() => generateProtocolPdf(renderedProtocol), {
      failure: "Could not create that PDF."
    });
  });

  document.getElementById("protocolPrintBtn").addEventListener("click", () => {
    if (!renderedProtocol) return;
    printElement(document.getElementById("protocol-preview"), {
      title: protocolFilename(renderedProtocol)
    });
  });

  loadProtocolHistory();
});
