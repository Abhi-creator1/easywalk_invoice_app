// Browser equivalents of the desktop build's "write this file to a folder" and
// "open a file picker" main-process handlers.

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked late: Safari needs the URL to outlive the click.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return filename;
}

function downloadBytes(bytes, filename, type = "application/octet-stream") {
  return downloadBlob(new Blob([bytes], { type }), filename);
}

function downloadJson(data, filename) {
  const text = JSON.stringify(data, null, 2);
  return downloadBlob(new Blob([text], { type: "application/json" }), filename);
}

// Resolves with the chosen File, or null if the user cancelled.
//
// There is no reliable "cancelled" event for <input type="file">, so this
// resolves null once the window regains focus without a selection having been
// made. Worst case the caller sees a cancel it can safely ignore.
function pickFile(accept = "application/json") {
  return new Promise(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    document.body.appendChild(input);

    let settled = false;
    const finish = file => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file || null);
    };

    input.addEventListener("change", () => finish(input.files && input.files[0]));
    window.addEventListener("focus", () => setTimeout(() => finish(null), 500), { once: true });

    input.click();
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Could not read that file."));
    reader.readAsText(file);
  });
}
