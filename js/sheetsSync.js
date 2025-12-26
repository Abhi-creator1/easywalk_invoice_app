const SHEET_NAME = "EasyWalk_Invoice_Ledger";

// Replace with your Sheet ID (from URL)
const SHEET_ID = "1pW3IqLI7gp7ZgFD_EVxOv8YZkyrj7kDjDeg6qWwXQ6Q";

async function appendRowsToSheet(rows) {
  const range = `Sheet1!A1`;

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}:append?valueInputOption=USER_ENTERED`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ values: rows })
    }
  );

  if (!res.ok) {
    const error = await res.json();
    console.error("Sheets API error:", error);
    throw new Error(error.error?.message || "Failed to append to Google Sheet");
  }
}
