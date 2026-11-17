// Thin wrapper around the Electron IPC API (window.api, from electron/preload.js).
const db = {
  invoices: {
    toArray: () => window.api.getInvoices(),
    put: invoice => window.api.saveInvoice(invoice)
  },
  documents: {
    toArray: docType => window.api.getDocuments(docType),
    put: doc => window.api.saveDocument(doc)
  },
  patients: {
    toArray: () => window.api.getPatients(),
    get: id => window.api.getPatient(id),
    put: patient => window.api.savePatient(patient),
    linkDocument: payload => window.api.linkPatientDocument(payload)
  }
};
