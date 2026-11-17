// Zero-dependency static file server for local development and the test
// harness. A service worker needs http (not file://), so the app has to be
// served even when working offline.
const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const ROOT = path.join(__dirname, "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".webmanifest": "application/manifest+json"
};

function createServer() {
  return http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(url.parse(req.url).pathname);
    } catch (err) {
      res.writeHead(400).end("Bad request");
      return;
    }

    if (pathname === "/") pathname = "/index.html";

    const filePath = path.join(ROOT, pathname);

    // Never serve anything outside the project directory.
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found: " + pathname);
        return;
      }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        // The service worker must never be served stale during development.
        "Cache-Control": "no-cache"
      });
      res.end(data);
    });
  });
}

function start(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(port || 0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port });
    });
  });
}

module.exports = { start, createServer };

if (require.main === module) {
  const port = Number(process.env.PORT) || 8080;
  start(port).then(({ port: actual }) => {
    console.log("EasyWalk web app running at http://127.0.0.1:" + actual + "/");
    console.log("Press Ctrl+C to stop.");
  }).catch(err => {
    console.error("Could not start the server:", err.message);
    process.exit(1);
  });
}
