// =======================
// IPD PATIENT PROFILES
// =======================
let allPatients = [];
let selectedPatientId = null;
// Remembered so that saving a patient does not throw away what was typed in
// the search box.
let patientFilter = "";

async function loadPatients() {
  const result = await run(() => db.patients.toArray(), {
    failure: "Could not load the patient list."
  });
  if (!result.ok) return;

  allPatients = result.value.slice().sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || "")));

  renderPatientList();
  refreshPatientDropdowns();
}

function renderPatientList() {
  const tbody = document.querySelector("#patientListTable tbody");
  const needle = patientFilter.trim().toLowerCase();

  const filtered = needle
    ? allPatients.filter(p => String(p.name || "").toLowerCase().includes(needle))
    : allPatients;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row">' +
      (allPatients.length ? "No patient matches that search." : "No IPD patients added yet.") +
      "</td></tr>";
    return;
  }

  tbody.innerHTML = filtered.map(p =>
    "<tr>" +
      "<td>" + escapeHtml(p.name || "-") + "</td>" +
      "<td>" + escapeHtml(p.age || "-") + " / " + escapeHtml(p.gender || "-") + "</td>" +
      "<td>" + escapeHtml(p.ward || "-") + "</td>" +
      "<td>" + escapeHtml(formatDMY(p.admissionDate)) + "</td>" +
      "<td>" + formatINR(p.billingTotal) + "</td>" +
      '<td class="row-actions">' +
        '<button type="button" data-act="view" data-id="' + escapeHtml(p.id) + '">View</button>' +
        '<button type="button" data-act="edit" data-id="' + escapeHtml(p.id) + '">Edit</button>' +
        '<button type="button" class="danger" data-act="delete" data-id="' + escapeHtml(p.id) + '">Delete</button>' +
      "</td>" +
    "</tr>").join("");

  tbody.onclick = async event => {
    const button = event.target.closest("button[data-act]");
    if (!button) return;

    const patient = allPatients.find(p => p.id === button.dataset.id);
    if (!patient) return;

    if (button.dataset.act === "view") return showPatientDetail(patient.id);
    if (button.dataset.act === "edit") return loadPatientIntoForm(patient.id);

    if (button.dataset.act === "delete") {
      const linked = (patient.linkedDocuments || []).length;
      const warning = linked
        ? "\n\nThis patient has " + linked + " linked document(s). Those invoices and " +
          "documents are NOT deleted, but they will no longer be linked to a profile."
        : "";
      if (!window.confirm("Delete the profile for " + (patient.name || "this patient") + "?" +
        warning + "\n\nThis cannot be undone.")) return;

      const outcome = await run(() => db.patients.remove(patient.id), {
        failure: "Could not delete that patient."
      });
      if (!outcome.ok) return;

      if (selectedPatientId === patient.id) {
        document.getElementById("patientDetailCard").style.display = "none";
      }
      toast("Patient profile deleted.", "success");
      await loadPatients();
    }
  };
}

function showPatientDetail(id) {
  const patient = allPatients.find(p => p.id === id);
  if (!patient) return;
  selectedPatientId = id;

  document.getElementById("patientDetailCard").style.display = "block";
  document.getElementById("patientDetailInfo").innerHTML = `
    <p><strong>${escapeHtml(patient.name)}</strong> — ${escapeHtml(patient.age || "-")} / ${escapeHtml(patient.gender || "-")}</p>
    <p>Phone: ${escapeHtml(patient.phone || "-")}</p>
    <p>Address: ${escapeMultiline(patient.address) || "-"}</p>
    <p>Diagnosis: ${escapeMultiline(patient.diagnosis) || "-"}</p>
    <p>Ward/Room: ${escapeHtml(patient.ward || "-")}</p>
    <p>Assigned Physiotherapist: ${escapeHtml(patient.physio || "-")}</p>
    <p>Admitted: ${escapeHtml(formatDMY(patient.admissionDate))} | Discharged: ${escapeHtml(formatDMY(patient.dischargeDate))}</p>
    <p>Running Billing Total: ${formatINR(patient.billingTotal)}</p>
  `;

  const docsBody = document.querySelector("#patientDocsTable tbody");
  const docs = patient.linkedDocuments || [];

  docsBody.innerHTML = docs.length
    ? docs.map(doc =>
        "<tr>" +
          "<td>" + escapeHtml(doc.docType) + "</td>" +
          "<td>" + escapeHtml(doc.docNumber) + "</td>" +
          "<td>" + escapeHtml(formatDMY(doc.date)) + "</td>" +
          "<td>" + (doc.amount === undefined ? "-" : formatINR(doc.amount)) + "</td>" +
        "</tr>").join("")
    : '<tr><td colspan="4" class="empty-row">Nothing linked yet.</td></tr>';

  document.getElementById("patientDetailCard").scrollIntoView({ behavior: "smooth" });
}

function loadPatientIntoForm(id) {
  const patient = allPatients.find(p => p.id === id);
  if (!patient) return;

  document.getElementById("patientId").value = patient.id;
  document.getElementById("patientName").value = patient.name || "";
  document.getElementById("patientAge").value = patient.age || "";
  document.getElementById("patientGender").value = patient.gender || "";
  document.getElementById("patientPhone").value = patient.phone || "";
  document.getElementById("patientAddress").value = patient.address || "";
  document.getElementById("patientDiagnosis").value = patient.diagnosis || "";
  document.getElementById("patientWard").value = patient.ward || "";
  document.getElementById("patientPhysio").value = patient.physio || "";
  document.getElementById("patientAdmissionDate").value = patient.admissionDate || "";
  document.getElementById("patientDischargeDate").value = patient.dischargeDate || "";

  document.getElementById("patient-form").scrollIntoView({ behavior: "smooth" });
}

function clearPatientForm() {
  document.getElementById("patient-form").reset();
  document.getElementById("patientId").value = "";
}

function refreshPatientDropdowns() {
  const options = ['<option value="">-- Select Patient --</option>']
    .concat(allPatients.map(p =>
      '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.name) +
      (p.ward ? " (" + escapeHtml(p.ward) + ")" : "") + "</option>"))
    .join("");

  ["invoicePatientSelect", "protocolPatientSelect", "certPatientSelect"].forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    const previous = select.value;
    select.innerHTML = options;
    // Keep whatever was already chosen, if that patient still exists.
    if (previous && allPatients.some(p => p.id === previous)) select.value = previous;
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadPatients();

  document.getElementById("patient-form").addEventListener("submit", async event => {
    event.preventDefault();

    const patient = {
      id: document.getElementById("patientId").value || undefined,
      name: document.getElementById("patientName").value,
      age: document.getElementById("patientAge").value,
      gender: document.getElementById("patientGender").value,
      phone: document.getElementById("patientPhone").value,
      address: document.getElementById("patientAddress").value,
      diagnosis: document.getElementById("patientDiagnosis").value,
      ward: document.getElementById("patientWard").value,
      physio: document.getElementById("patientPhysio").value,
      admissionDate: document.getElementById("patientAdmissionDate").value,
      dischargeDate: document.getElementById("patientDischargeDate").value
    };

    // Linked documents and the running total belong to the record, not the
    // form, so carry them across an edit rather than resetting them.
    if (patient.id) {
      const existing = allPatients.find(p => p.id === patient.id);
      patient.linkedDocuments = existing ? (existing.linkedDocuments || []) : [];
      patient.billingTotal = existing ? toNumber(existing.billingTotal) : 0;
    }

    const outcome = await run(() => db.patients.put(patient), {
      failure: "Could not save that patient."
    });
    if (!outcome.ok) return;

    clearPatientForm();
    await loadPatients();
    toast("Patient profile saved.", "success");
  });

  document.getElementById("patientClearBtn").addEventListener("click", clearPatientForm);

  document.getElementById("patientSearch").addEventListener("input", event => {
    patientFilter = event.target.value;
    renderPatientList();
  });
});
