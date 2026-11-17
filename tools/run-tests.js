// Launches the Electron-based test harness.
//
// Electron silently degrades to plain Node when ELECTRON_RUN_AS_NODE is set in
// the environment (some shells and CI images set it), in which case
// require("electron") hands back a path string instead of the API. Spawning
// with that variable removed makes `npm test` behave the same everywhere.
const { spawn } = require("child_process");
const path = require("path");

const electron = require("electron");
if (typeof electron !== "string") {
  console.error("Run this with plain node, not electron: node tools/run-tests.js");
  process.exit(2);
}

const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, [path.join(__dirname, "test-web.js")], {
  stdio: "inherit",
  env
});

child.on("exit", code => process.exit(code === null ? 1 : code));
child.on("error", err => {
  console.error("Could not start Electron:", err.message);
  process.exit(2);
});
