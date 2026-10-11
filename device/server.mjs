import max from "max-api";
import { execFile } from "node:child_process";
import { startUiServer } from "./ui-server.mjs";
import assets from "#ui-assets";
let server;
let starting;
let liveContext = { connected: false };
function start() {
  // Opening an already-running editor must not reload its page/erase its chat.
  if (server) return;
  if (starting) return starting;
  starting = (async () => {
    try {
      server = await startUiServer({ assets, getContext: () => liveContext });
      max.outlet("uiurl", server.editorUrl);
      max.outlet("panel", "ready");
    } catch {
      max.outlet("panel", "unavailable");
      max.post("Midi Journey 2: close another Midi Journey 2 device or preview using port 5178, then click the device image to retry.", max.POST_LEVELS.ERROR);
    }
  })().finally(() => { starting = undefined; });
  return starting;
}
max.addHandler("start", start);
// Read-only health/context mirror. Never include credentials or full prompts.
max.addHandler("context", (raw) => {
  try {
    const value = JSON.parse(raw);
    liveContext = { connected: value.connected === true, destination: value.destination, error: value.error };
  } catch { liveContext = { connected: false }; }
});
max.addHandler("dashboard", () => {
  const url = "https://enter.pollinations.ai/pollen";
  const executable = process.platform === "win32" ? "rundll32" : process.platform === "darwin" ? "/usr/bin/open" : "xdg-open";
  const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  execFile(executable, args, { timeout: 10000 }, (error) => {
    if (error) max.post("Could not open the Pollinations dashboard.", max.POST_LEVELS.ERROR);
  });
});
process.once("SIGTERM", () => {
  void (async () => {
    await starting;
    await server?.close();
  })().finally(() => process.exit(0));
});
void start();
