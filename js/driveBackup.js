const CLIENT_ID = "878563573162-192se2d3ve7cshh1uphd8tv5r94161vs.apps.googleusercontent.com"; // Your Google OAuth Client ID
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets";
const DRIVE_AUTH_KEY = "easywalk_drive_authed";
let accessToken = null;

function initDriveAuth() {
  return new Promise((resolve, reject) => {
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (tokenResponse) => {
        if (tokenResponse.access_token) {
          accessToken = tokenResponse.access_token;
          localStorage.setItem(DRIVE_AUTH_KEY, "true");
          resolve();
        } else {
          reject("No access token");
        }
      }
    });

    const alreadyAuthed = localStorage.getItem(DRIVE_AUTH_KEY);
    tokenClient.requestAccessToken(
      alreadyAuthed ? {} : { prompt: "select_account" } // First time on this device
    );
  });
}

async function getOrCreateFolder() {
  const query = encodeURIComponent(
    "name='EasyWalk_Invoice_Backup' and mimeType='application/vnd.google-apps.folder' and trashed=false"
  );

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }

  const createRes = await fetch(
    "https://www.googleapis.com/drive/v3/files",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "EasyWalk_Invoice_Backup",
        mimeType: "application/vnd.google-apps.folder"
      })
    }
  );

  const folder = await createRes.json();
  return folder.id;
}

async function uploadPdfToDrive(blob, filename, folderId) {
  const metadata = {
    name: filename,
    parents: [folderId]
  };

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );
  form.append("file", blob);

  await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form
    }
  );
}

// Function to generate the PDF using html2pdf
async function generatePdf(invoice) {
  const invoiceContent = document.getElementById("invoice-preview");

  const options = {
    margin:       0,
    filename:     `${invoice.invoiceNumber}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 4 },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  html2pdf()
    .from(invoiceContent)
    .set(options)
    .toPdf()
    .get('pdf')
    .then(function(pdf) {
      const pdfBlob = pdf.output("blob");

      // Get or create the Google Drive folder and upload the PDF
      getOrCreateFolder().then((folderId) => {
        uploadPdfToDrive(pdfBlob, `${invoice.invoiceNumber}.pdf`, folderId);
      });
    });
}

async function backupToDrive(invoice) {
  try {
    console.log("Backup process started...");
    await initDriveAuth();  // Ensure authentication is complete

    // Generate PDF from the invoice content and upload to Drive
    await generatePdf(invoice); // Pass the invoice data to generate PDF

    alert("Backup to Google Drive successful ✅");
  } catch (error) {
    console.error("Drive Backup Error:", error);
    alert("Backup failed, please try again.");
  }
}
