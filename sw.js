const CACHE_NAME = "easywalk-invoice-v1";

const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/dexie.min.js",
  "./js/html2pdf.bundle.min.js",
  "./js/db.js",
  "./js/invoice.js",
  "./js/pdf.js",
  "./js/sync.js",
  "./js/ui.js",
  "./assets/logo.png",
  "./manifest.json"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
