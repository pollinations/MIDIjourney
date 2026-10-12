autowatch = 0;
inlets = 1;
outlets = 2;
function show() { outlet(0, "open"); }
// Resizing and reopening preserve both web surfaces and the conversation.
function editor(mode) {
  if (mode === "show") show();
}

// Use stable dynamic-color IDs: display labels are not unique (in particular
// Text / Icon On (Inactive) also names the unrelated disabled-text color).
// A refresh queries the whole palette, then sends one complete snapshot to both
// web surfaces. Appearance data only; no session/account data crosses this bridge.
var colors = {};
var colorRoles = {
  "live_surface_bg": "background",
  "live_control_fg": "text",
  "live_control_text_bg": "surface",
  "live_control_bg": "controlOff",
  "live_control_fg_off": "textOff",
  "live_control_selection": "controlOn",
  "live_control_fg_on": "textOn",
  "live_control_zombie": "disabled",
  "live_control_fg_on_zombie": "disabledText",
  "live_control_fg_off_zombie": "muted",
  "live_contrast_frame": "border",
  "live_focus_frame": "focus",
  "live_selection": "selection",
  "live_control_text_selection": "selectionText",
  "live_control_fill_handle": "scrollbar",
  "live_lcd_bg": "display",
  "live_lcd_control_fg": "displayText",
  "live_lcd_control_fg_zombie": "displayMuted",
  "live_lcd_frame": "displayLine",
  "live_display_line_one": "displayShape",
  "live_alert": "alert",
  "live_play": "success"
};
function validColor(r, g, b, a) {
  var channels = [r,g,b,a];
  for (var i = 0; i < channels.length; i++)
    if (typeof channels[i] !== "number" || !isFinite(channels[i]) ||
      channels[i] < 0 || channels[i] > 1) return false;
  return true;
}
function livecolor(name, r, g, b, a) {
  var role = colorRoles[name];
  if (!role || !validColor(r,g,b,a)) return;
  colors[role] = [r,g,b,a];
}
// Older locally saved patchers still supply these two messages. Their fallback
// remains neutral until a complete palette is available from the updated device.
function background(r, g, b, a) {
  livecolor("live_surface_bg", r,g,b, typeof a === "number" ? a : 1);
  theme();
}
function foreground(r, g, b, a) {
  livecolor("live_control_fg", r,g,b, typeof a === "number" ? a : 1);
  theme();
}
function luminance(rgb) { return rgb[0]*0.2126 + rgb[1]*0.7152 + rgb[2]*0.0722; }
var lastPalette = "";
function publishTheme(force) {
  if (!colors.background || !colors.text) return;
  var mode = luminance(colors.text) > luminance(colors.background) ? "dark" : "light";
  var payload = JSON.stringify(colors);
  if (!force && payload === lastPalette) return;
  lastPalette = payload;
  outlet(1, "theme", mode, payload);
}

function palette() { publishTheme(false); }
function theme() { publishTheme(true); }
