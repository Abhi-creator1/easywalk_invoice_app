async function syncLedger() {
  try {
    await initDriveAuth();

    const unsynced = await db.invoices
      .where("syncStatus")
      .equals("PENDING")
      .toArray();

    if (unsynced.length === 0) {
      alert("All invoices are already synced ✅");
      return;
    }

    const rows = unsynced.map(inv => [
      inv.invoiceNumber,
      inv.invoiceDate,
      inv.customer.name,
      inv.customer.phone,
      inv.subtotal,
      inv.cgst,      // Added CGST
      inv.sgst,      // Added SGST
      inv.gstAmount,
      inv.total,
      inv.paid,      // Added Paid amount
      inv.balance,   // Added Balance
      new Date().toISOString()  // Timestamp for sync
    ]);

    await appendRowsToSheet(rows);

    // Mark all as synced
    for (const inv of unsynced) {
      inv.syncStatus = "SYNCED";
      await db.invoices.put(inv);
    }

    alert(`${unsynced.length} invoices synced to ledger ✅`);
  } catch (err) {
    console.error(err);
    alert("Ledger sync failed. Try again later.");
  }
}
