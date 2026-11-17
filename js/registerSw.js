// Registers the service worker that makes the app work offline.
// A separate file rather than an inline <script> so the page can ship a
// Content-Security-Policy without needing script-src 'unsafe-inline'.
//
// The path is relative so the app also works when served from a GitHub Pages
// subfolder.
//
// Registration is skipped unless the page is actually being served over
// http/https. That keeps this file inert in the Electron desktop build, which
// loads from file:// where service workers are unavailable -- so index.html can
// stay byte-identical between the web and desktop branches.
const SW_SUPPORTED = "serviceWorker" in navigator &&
  window.isSecureContext &&
  (location.protocol === "http:" || location.protocol === "https:");

if (SW_SUPPORTED) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(err => {
      console.warn("Offline mode unavailable:", err);
    });
  });
}
