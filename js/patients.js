// =======================
// IPD PATIENT PROFILES
// =======================
let allPatients = [];
let selectedPatientId = null;

function formatDate(d) {
  return d || "-";
}

async function loadPatients() {
  allPatients = await db.patients.toArray();
  renderPatientList();
  await refreshPatientDropdowns();
}

function renderPatientList(filterText) {
  const tbody = document.querySelector("#patientListTable tbody");
  tbody.innerHTML = "";

  const filtered = filterText
    ? allPatients.filter(p => p.name.toLowerCase().includes(filterText.toLowerCase()))
    : allPatients;

  filtered.forEach(p => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${p.name}</td>
      <td>${p.age || "-"} / ${p.gender || "-"}</td>
      <td>${p.ward || "-"}</td>
      <td>${formatDate(p.admissionDate)}</td>
      <td>₹ ${(p.billingTotal || 0).toFixed(2)}</td>
      <td>
        <button type="button" class="view-patient" data-id="${p.id}">View</button>
        <button type="button" class="edit-patient" data-id="${p.id}">Edit</button>
      </td>
    `;
    tbody.appendChild(row);
  });

  tbody.querySelectorAll(".view-patient").forEach(btn => {
    btn.addEventListener("click", () => showPatientDetail(btn.dataset.id));
  });
  tbody.querySelectorAll(".edit-patient").forEach(btn => {
    btn.addEventListener("click", () => loadPatientIntoForm(btn.dataset.id));
  });
}

function showPatientDetail(id) {
  const patient = allPatients.find(p => p.id === id);
  if (!patient) return;

  document.getElementById("patientDetailCard").style.display = "block";
  document.getElementById("patientDetailInfo").innerHTML = `
    <p><strong>${patient.name}</strong> — ${patient.age || "-"} / ${patient.gender || "-"}</p>
    <p>Phone: ${patient.phone || "-"}</p>
    <p>Address: ${patient.address || "-"}</p>
    <p>Diagnosis: ${patient.diagnosis || "-"}</p>
    <p>Ward/Room: ${patient.ward || "-"}</p>
    <p>Assigned Physiotherapist: ${patient.physio || "-"}</p>
    <p>Admitted: ${formatDate(patient.admissionDate)} | Discharged: ${formatDate(patient.dischargeDate)}</p>
    <p>Running Billing Total: ₹ ${(patient.billingTotal || 0).toFixed(2)}</p>
  `;

  const docsBody = document.querySelector("#patientDocsTable tbody");
  docsBody.innerHTML = "";
  (patient.linkedDocuments || []).forEach(doc => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${doc.docType}</td><td>${doc.docNumber}</td><td>${doc.date}</td>`;
    docsBody.appendChild(row);
  });

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

async function refreshPatientDropdowns() {
  const options = ['<option value="">-- Select Patient --</option>']
    .concat(allPatients.map(p => `<option value="${p.id}">${p.name}${p.ward ? " (" + p.ward + ")" : ""}</option>`))
    .join("");

  ["invoicePatientSelect", "protocolPatientSelect", "certPatientSelect"].forEach(id => {
    const select = document.getElementById(id);
    if (select) select.innerHTML = options;
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadPatients();

  document.getElementById("patient-form").addEventListener("submit", async e => {
    e.preventDefault();

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

    if (patient.id) {
      const existing = allPatients.find(p => p.id === patient.id);
      patient.linkedDocuments = existing ? existing.linkedDocuments : [];
      patient.billingTotal = existing ? existing.billingTotal : 0;
    }

    await db.patients.put(patient);
    clearPatientForm();
    await loadPatients();
    alert("Patient profile saved ✅");
  });

  document.getElementById("patientClearBtn").addEventListener("click", clearPatientForm);

  document.getElementById("patientSearch").addEventListener("input", e => {
    renderPatientList(e.target.value);
  });
});
