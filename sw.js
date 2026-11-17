// Service worker: makes the app open and work with no internet connection.
//
// Bump CACHE_VERSION whenever any file below changes, otherwise returning
// visitors keep the old copy.
const CACHE_VERSION = "easywalk-v2";

// All paths are relative so the app also works when served from a GitHub Pages
// subfolder (e.g. /easywalk_invoice_app/).
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/app.css",
  "./assets/logo.png",
  "./js/html2pdf.bundle.min.js",
  "./js/config/clinic.js",
  "./js/core/util.js",
  "./js/platform/store.idb.js",
  "./js/platform/download.js",
  "./js/platform/api.web.js",
  "./js/db.js",
  "./js/pdfOptions.js",
  "./js/templates/docHeader.js",
  "./js/templates/invoiceChrome.js",
  "./js/pagination.js",
  "./js/components/datePicker.js",
  "./js/invoice.js",
  "./js/pdf.js",
  "./js/ui.js",
  "./js/patients.js",
  "./js/documents/treatmentProtocol.js",
  "./js/documents/certificate.js",
  "./js/documents/additionalDocument.js",
  "./js/settings.js",
  "./js/nav.js",
  "./js/registerSw.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      // addAll fails the whole install if any single file 404s, so each is
      // added on its own: a missing file must not leave the app uncached.
      .then(cache => Promise.all(PRECACHE.map(url =>
        cache.add(new Request(url, { cache: "reload" })).catch(err => {
          console.warn("[sw] could not cache", url, err);
        }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // Page loads go to the network first, so a newly deployed version is picked
  // up straight away; the cache is the offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          caches.open(CACHE_VERSION).then(cache => cache.put(request, response.clone()));
          return response;
        })
        .catch(() => caches.match(request).then(hit => hit || caches.match("./index.html")))
    );
    return;
  }

  // Assets come from the cache immediately and are refreshed in the background.
  event.respondWith(
    caches.match(request).then(hit => {
      const network = fetch(request)
        .then(response => {
          if (response && response.ok) {
            caches.open(CACHE_VERSION).then(cache => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});
