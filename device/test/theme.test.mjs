import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import {
	LIVE_COLOR_ROLES,
	liveThemeProperties,
} from "../../app/src/live-theme.mjs";
import { makeDevice } from "../../scripts/device.mjs";

async function panel() {
	const messages = [];
	const host = { outlet: (...values) => messages.push(values) };
	vm.createContext(host);
	vm.runInContext(
		await readFile(new URL("../panel.js", import.meta.url), "utf8"),
		host,
	);
	return { host, messages };
}

test("native palette reaches both browsers as one complete snapshot", async () => {
	const { host, messages } = await panel();
	const patcher = makeDevice().patcher;
	const query = patcher.boxes.find(({ box }) => box.id === "get-colors").box
		.text;
	const names = [...query.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
	assert.deepEqual(names.sort(), Object.keys(host.colorRoles).sort());
	assert.deepEqual(
		Object.values(host.colorRoles).sort(),
		[...LIVE_COLOR_ROLES].sort(),
	);
	for (const name of names) host.livecolor(name, 0.2, 0.3, 0.4, 0.8);
	host.livecolor("live_surface_bg", 0.1, 0.12, 0.13, 1);
	host.livecolor("live_control_fg", 0.8, 0.85, 0.9, 1);
	assert.equal(messages.length, 0);
	host.theme();
	const [, action, mode, payload] = messages.at(-1);
	assert.equal(action, "theme");
	assert.equal(mode, "dark");
	const properties = liveThemeProperties(mode, payload);
	assert.equal(properties["--mj-live-controlOn"], "rgb(51 77 102 / 0.8)");
	assert.ok(Object.values(properties).every(Boolean));
	const connects = (source, outlet, destination) =>
		patcher.lines.some(
			({ patchline }) =>
				patchline.source[0] === source &&
				patchline.source[1] === outlet &&
				patchline.destination[0] === destination,
		);
	assert.ok(connects("color-refresh", 1, "get-colors")); // Query synchronously before publishing.
	assert.ok(connects("color-refresh", 0, "palette"));
	assert.ok(connects("palette", 0, "panel"));
	assert.ok(connects("panel", 1, "controls"));
	assert.ok(connects("panel", 1, "window"));
});

test("palette changes replace colors, ignore invalid input and replay to new windows", async () => {
	const { host, messages } = await panel();
	host.background(0.2, 0.18, 0.17);
	assert.equal(messages.length, 0);
	host.foreground(0.8, 0.8, 0.8);
	assert.equal(messages.at(-1)[2], "dark");
	host.livecolor("live_control_selection", 0.1, 0.7, 0.4, 1);
	host.background(0.9, 0.9, 0.9);
	host.foreground(0.1, 0.1, 0.1);
	assert.equal(messages.at(-1)[2], "light");
	const payload = messages.at(-1)[3];
	host.livecolor("live_control_selection", NaN, 0, 0, 1);
	host.livecolor("live_control_selection", 0, 0, 0, 2);
	host.livecolor("Unknown", 0, 0, 0, 1);
	host.theme();
	assert.equal(messages.at(-1)[3], payload);
	assert.deepEqual(JSON.parse(payload).controlOn, [0.1, 0.7, 0.4, 1]);
});

// Immaterial reproduces the native failure: generic disabled text is the same
// gray as the inactive control fill; the control-icon foreground is dark.
test("inactive Send icon uses its unambiguous native color", async () => {
	const { host, messages } = await panel();
	host.livecolor("live_surface_bg", 0.18, 0.19, 0.22, 1);
	host.livecolor("live_control_fg", 0.8, 0.8, 0.8, 1);
	host.livecolor("live_control_zombie", 0.49, 0.5, 0.53, 1);
	host.livecolor("live_control_fg_on_zombie", 0.11, 0.12, 0.14, 1);
	host.livecolor("live_control_text_zombie", 0.49, 0.5, 0.53, 1);
	host.palette();
	const colors = JSON.parse(messages.at(-1)[3]);
	assert.deepEqual(colors.disabledText, [0.11, 0.12, 0.14, 1]);
	assert.notDeepEqual(colors.disabledText, colors.disabled);
});

test("unchanged palettes are suppressed and new windows can request a replay", async () => {
	const { host, messages } = await panel();
	host.livecolor("live_surface_bg", 0.2, 0.2, 0.2, 1);
	host.livecolor("live_control_fg", 0.9, 0.9, 0.9, 1);
	host.palette();
	host.palette();
	assert.equal(messages.length, 1);
	// Native color values change before the next completed snapshot.
	host.livecolor("live_surface_bg", 0.95, 0.95, 0.95, 1);
	host.livecolor("live_control_fg", 0.1, 0.1, 0.1, 1);
	host.palette();
	assert.equal(messages.length, 2);
	assert.equal(messages.at(-1)[2], "light");
	host.theme();
	assert.equal(messages.length, 3);
	assert.equal(messages.at(-1)[3], messages.at(-2)[3]);
});
