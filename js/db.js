// Thin wrapper around window.api, which is provided by either
// electron/preload.js (desktop build) or js/platform/api.web.js (web build).
// Feature code only ever talks to this object, so neither platform leaks in.
const db = {
  invoices: {
    toArray: () => window.api.getInvoices(),
    get: invoiceNumber => window.api.getInvoice(invoiceNumber),
    put: invoice => window.api.saveInvoice(invoice),
    remove: invoiceNumber => window.api.deleteInvoice(invoiceNumber)
  },
  documents: {
    toArray: docType => window.api.getDocuments(docType),
    get: docNumber => window.api.getDocument(docNumber),
    put: doc => window.api.saveDocument(doc),
    remove: docNumber => window.api.deleteDocument(docNumber)
  },
  patients: {
    toArray: () => window.api.getPatients(),
    get: id => window.api.getPatient(id),
    put: patient => window.api.savePatient(patient),
    remove: id => window.api.deletePatient(id),
    linkDocument: payload => window.api.linkPatientDocument(payload)
  }
};
