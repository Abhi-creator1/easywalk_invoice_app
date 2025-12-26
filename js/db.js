// Initialize IndexedDB using Dexie
const db = new Dexie("EasyWalkInvoiceDB");

db.version(1).stores({
  invoices: "invoiceNumber, invoiceDate, syncStatus",
  counters: "monthKey"
});
