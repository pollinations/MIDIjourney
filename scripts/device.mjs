import { resolve } from "node:path";
import { NATIVE_NAME } from "./build-native.mjs";

export function makeDevice(directory) {
	const asset = (name) =>
		directory
			? resolve(directory, `midijourney-${name}.js`)
			: `midijourney-${name}.js`;
	const box = (id, maxclass, rect, extra = {}) => ({
		box: { id, maxclass, patching_rect: rect, ...extra },
	});
	const obj = (id, text, rect, extra) =>
		box(id, "newobj", rect, { text, ...extra });
	const line = (a, ao, b, bi = 0) => ({
		patchline: { source: [a, ao], destination: [b, bi] },
	});
	const base = {
		fileversion: 1,
		appversion: {
			major: 9,
			minor: 1,
			revision: 5,
			architecture: "x64",
			modernui: 1,
		},
		classnamespace: "box",
		rect: [180, 80, 420, 550],
		openinpresentation: 1,
		default_fontsize: 12,
		toolbarvisible: 0,
		enablehscroll: 0,
		enablevscroll: 0,
		bglocked: 1,
		boxes: [],
		lines: [],
	};
	const window = {
		...base,
		title: "MIDI Journey 2",
		boxes: [
			obj("in", "inlet", [820, 0, 40, 22]),
			obj("out", "outlet", [820, 35, 40, 22]),
			box("web", "jweb", [0, 0, 420, 550], {
				varname: "browser",
				presentation: 1,
				presentation_rect: [0, 0, 420, 550],
				rendermode: 1,
			}),
			obj("load", "loadbang", [820, 80, 60, 22]),
			obj("shortcuts", NATIVE_NAME, [820, 430, 300, 22], {
				varname: "native-window",
			}),
			box("config", "message", [820, 110, 300, 22], {
				text: "window flags grow, window flags float, window flags nomenu, window flags nominimize, window flags nozoom, window size 180 80 600 630, window constrain 420 324 720 1400, window exec",
			}),
			obj("patcher", "thispatcher", [820, 150, 70, 22]),
			box("one", "message", [820, 185, 30, 22], { text: "1" }),
			obj("clock", "qmetro 200", [820, 220, 75, 22]),
			box("size", "message", [820, 255, 110, 22], { text: "window getsize" }),
			obj("route", "route window", [820, 290, 90, 22]),
			obj("size-route", "route size", [820, 325, 65, 22]),
			obj("resize", "prepend resize", [820, 360, 95, 22]),
			obj("controller", `js ${asset("window")}`, [820, 395, 250, 22]),
		],
		lines: [
			line("in", 0, "web"),
			line("web", 0, "out"),
			line("load", 0, "config"),
			line("config", 0, "patcher"),
			line("load", 0, "one"),
			line("one", 0, "clock"),
			line("clock", 0, "size"),
			line("size", 0, "patcher"),
			line("patcher", 0, "route"),
			line("route", 0, "size-route"),
			line("size-route", 0, "resize"),
			line("resize", 0, "controller"),
		],
	};
	return {
		patcher: {
			...base,
			rect: [100, 100, 950, 650],
			devicewidth: 200,
			project: {
				name: "MIDI Journey 2",
				version: 1,
				amxdtype: 0x61616161,
				hideprojectwindow: 1,
				autoorganize: 0,
				autolocalize: 0,
				contents: { patchers: {} },
				searchpath: {},
				devpathtype: 0,
				devpath: ".",
			},
			description:
				"MIDI Journey 2 — persistent AI MIDI creation. Place one device on Main.",
			tags: "MIDI, generative, Pollinations",
			minimum_live_version: "12.0.0",
			minimum_max_version: "9.1.5",
			boxes: [
				box("controls", "jweb", [600, 20, 200, 169], {
					varname: "device-controls",
					presentation: 1,
					presentation_rect: [0, 0, 200, 169],
					// Device controls must follow Live's interface zoom. The separate
					// text editor retains onscreen rendering for native editing.
					rendermode: 0,
				}),
				obj("controls-read", "prepend read", [600, 220, 100, 22]),
				obj(
					"controls-route",
					"route editor account theme",
					[600, 245, 150, 22],
				),
				obj("editor-command", "prepend editor", [600, 275, 100, 22]),
				obj("account", "prepend account", [760, 275, 110, 22]),
				box("theme", "message", [760, 310, 70, 22], { text: "theme" }),
				obj("colors", "live.colors", [600, 400, 80, 22]),
				obj("color-refresh", "t b b", [840, 370, 55, 22]),
				box("palette", "message", [840, 405, 60, 22], { text: "palette" }),
				box("get-colors", "message", [600, 370, 230, 22], {
					text: '"live_surface_bg", "live_control_fg", "live_control_text_bg", "live_control_bg", "live_control_fg_off", "live_control_selection", "live_control_fg_on", "live_control_zombie", "live_control_fg_on_zombie", "live_control_fg_off_zombie", "live_contrast_frame", "live_focus_frame", "live_selection", "live_control_text_selection", "live_control_fill_handle", "live_lcd_bg", "live_lcd_control_fg", "live_lcd_control_fg_zombie", "live_lcd_frame", "live_display_line_one", "live_alert", "live_play"',
				}),
				obj("color-values", "prepend livecolor", [600, 435, 150, 22]),
				box("popen", "message", [290, 20, 45, 22], { text: "show" }),
				obj("pcontrol", "pcontrol", [230, 55, 60, 22]),
				obj("window", "p MIDI Journey 2", [230, 100, 180, 22], {
					varname: "editor",
					patcher: window,
				}),
				obj("bridge", `js ${asset("bridge")}`, [230, 170, 300, 22]),
				obj("defer", "deferlow", [230, 135, 60, 22]),
				obj("live", "live.thisdevice", [20, 170, 95, 22]),
				obj("open-delay", "delay 1000", [20, 305, 80, 22]),
				box("init", "message", [20, 205, 35, 22], { text: "init" }),
				obj(
					"server",
					`node.script ${asset("server")} @autostart 1 @watch 0`,
					[230, 260, 550, 22],
				),
				box("start", "message", [20, 260, 40, 22], { text: "start" }),
				obj("route", "route uiurl controlsurl", [230, 300, 240, 22]),
				obj("read", "prepend read", [230, 335, 90, 22]),
				obj("panel", `js ${asset("panel")}`, [600, 335, 200, 22]),
				obj("audioin", "plugin~", [20, 370, 60, 22]),
				obj("audioout", "plugout~", [20, 410, 60, 22]),
			],
			lines: [
				line("popen", 0, "panel"),
				line("panel", 0, "pcontrol"),
				line("pcontrol", 0, "window"),
				line("window", 0, "defer"),
				line("defer", 0, "controls-route"),
				line("bridge", 0, "window"),
				line("bridge", 1, "server"),
				line("live", 0, "init"),
				line("init", 0, "bridge"),
				line("live", 0, "open-delay"),
				line("open-delay", 0, "popen"),
				line("start", 0, "server"),
				line("server", 0, "route"),
				line("route", 1, "controls-read"),
				line("controls-read", 0, "controls"),
				line("controls", 0, "controls-route"),
				line("controls-route", 0, "editor-command"),
				line("editor-command", 0, "panel"),
				line("controls-route", 1, "account"),
				line("controls-route", 2, "theme"),
				line("controls-route", 3, "bridge"),
				line("account", 0, "server"),
				line("theme", 0, "panel"),
				line("live", 0, "color-refresh"),
				line("colors", 1, "color-refresh"),
				line("color-refresh", 1, "get-colors"),
				line("color-refresh", 0, "palette"),
				line("palette", 0, "panel"),
				line("get-colors", 0, "colors"),
				line("colors", 0, "color-values"),
				line("color-values", 0, "panel"),
				line("panel", 1, "controls"),
				line("panel", 1, "window"),

				line("route", 0, "read"),
				line("read", 0, "window"),
				line("audioin", 0, "audioout", 0),
				line("audioin", 1, "audioout", 1),
			],
		},
	};
}
