const { contextBridge, ipcRenderer } = require("electron");

// This is the contract the whole renderer is written against. The web build
// provides the same method names from js/platform/api.web.js, which is what
// lets index.html, css/ and js/ stay identical on both branches.
contextBridge.exposeInMainWorld("api", {
  platform: "desktop",

  getInvoices: () => ipcRenderer.invoke("invoices:get"),
  getInvoice: invoiceNumber => ipcRenderer.invoke("invoices:getOne", invoiceNumber),
  saveInvoice: invoice => ipcRenderer.invoke("invoices:save", invoice),
  deleteInvoice: invoiceNumber => ipcRenderer.invoke("invoices:delete", invoiceNumber),

  getDocuments: docType => ipcRenderer.invoke("documents:get", docType),
  getDocument: docNumber => ipcRenderer.invoke("documents:getOne", docNumber),
  saveDocument: doc => ipcRenderer.invoke("documents:save", doc),
  deleteDocument: docNumber => ipcRenderer.invoke("documents:delete", docNumber),

  getPatients: () => ipcRenderer.invoke("patients:get"),
  getPatient: id => ipcRenderer.invoke("patients:getOne", id),
  savePatient: patient => ipcRenderer.invoke("patients:save", patient),
  deletePatient: id => ipcRenderer.invoke("patients:delete", id),
  linkPatientDocument: payload => ipcRenderer.invoke("patients:linkDocument", payload),

  nextDocNumber: (prefix, options) => ipcRenderer.invoke("counters:next", prefix, options),
  peekDocNumber: (prefix, options) => ipcRenderer.invoke("counters:peek", prefix, options),

  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: partial => ipcRenderer.invoke("settings:set", partial),
  pickFolder: () => ipcRenderer.invoke("settings:pickFolder"),
  getStats: () => ipcRenderer.invoke("stats:get"),

  savePdf: (buffer, docType, docNumber) => ipcRenderer.invoke("pdf:save", { buffer, docType, docNumber }),

  exportBackup: () => ipcRenderer.invoke("backup:export"),
  importBackup: () => ipcRenderer.invoke("backup:import")
});
