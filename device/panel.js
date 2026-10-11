autowatch = 0;
inlets = 1;
outlets = 1;
var connected = false;
var previous = "";
var watcher = null;
// Read actual native visibility, including closing with the title-bar button.
function visible() {
  return Boolean(this.patcher.getnamed("editor").subpatcher().wind.visible);
}
function refresh() {
  var state = (visible() ? "close" : "open") + "-" + (connected ? "connected" : "disconnected");
  if (state === previous) return;
  previous = state;
  this.patcher.getnamed("device-artwork").message("pic", "midijourney-" + state + ".png");
}
function init() {
  if (watcher) watcher.cancel();
  watcher = new Task(refresh, this);
  watcher.interval = 200;
  watcher.repeat();
  refresh();
}
function toggle() { outlet(0, visible() ? "close" : "open"); }
function show() { outlet(0, "open"); }
// Only the web app's SDK auth state drives the headphone light.
function auth(value) { connected = Number(value) === 1; refresh(); }
function ready() { refresh(); }
function unavailable() { connected = false; refresh(); }
function notifydeleted() { if (watcher) watcher.cancel(); }
