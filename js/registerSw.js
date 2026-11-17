// Registers the service worker that makes the app work offline.
// A separate file rather than an inline <script> so the page can ship a
// Content-Security-Policy without needing script-src 'unsafe-inline'.
//
// The path is relative so the app also works when served from a GitHub Pages
// subfolder. Registration is skipped on file:// (and anywhere else that is not
// a secure context), where service workers are not allowed.
if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(err => {
      console.warn("Offline mode unavailable:", err);
    });
  });
}
