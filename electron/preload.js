const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getInvoices: () => ipcRenderer.invoke("invoices:get"),
  saveInvoice: invoice => ipcRenderer.invoke("invoices:save", invoice),

  getDocuments: docType => ipcRenderer.invoke("documents:get", docType),
  saveDocument: doc => ipcRenderer.invoke("documents:save", doc),

  getPatients: () => ipcRenderer.invoke("patients:get"),
  getPatient: id => ipcRenderer.invoke("patients:getOne", id),
  savePatient: patient => ipcRenderer.invoke("patients:save", patient),
  linkPatientDocument: payload => ipcRenderer.invoke("patients:linkDocument", payload),

  nextDocNumber: prefix => ipcRenderer.invoke("counters:next", prefix),

  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: partial => ipcRenderer.invoke("settings:set", partial),
  pickFolder: () => ipcRenderer.invoke("settings:pickFolder"),

  savePdf: (buffer, docType, docNumber) => ipcRenderer.invoke("pdf:save", { buffer, docType, docNumber }),

  exportBackup: () => ipcRenderer.invoke("backup:export"),
  importBackup: () => ipcRenderer.invoke("backup:import")
});
