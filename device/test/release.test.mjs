import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { makeDevice } from "../../scripts/device.mjs";
import frozen from "../../scripts/frozen-amxd.cjs";
import {
	RUNTIME_FILES,
	verifyBuild,
	verifyFrozen,
	verifyPatcher,
} from "../../scripts/release-lib.mjs";

test("build manifest binds every production output, and an editable device is not a frozen release", async () => {
	const manifest = await verifyBuild();
	assert.ok(
		!Object.keys(manifest.files).some((name) =>
			/midijourney-(open|close)-/.test(name),
		),
	);
	const source = await readFile(
		new URL("../../dist/MIDI Journey 2.source.amxd", import.meta.url),
	);
	frozen.assertAmpfContainer(source);
	assert.throws(() => frozen.inspectFrozenAmxd(source), /frozen Max metadata/);
});

test("native Max serialization normalizes ports without accepting functional changes", () => {
	const expected = {
		minimum_max_version: "9.1.5",
		boxes: [{ box: { id: "in", maxclass: "newobj", text: "inlet" } }],
		lines: [],
	};
	const saved = {
		boxes: [{ box: { id: "in", maxclass: "inlet" } }],
		lines: [],
	};
	verifyPatcher(saved, expected, { nativeSaved: true });
	assert.throws(() => verifyPatcher(saved, expected), /minimum_max_version/);
	saved.boxes[0].box.maxclass = "outlet";
	assert.throws(
		() => verifyPatcher(saved, expected, { nativeSaved: true }),
		/changed/,
	);
});

test("native color-query quote normalization still rejects changed atoms or messages", () => {
	const expected = makeDevice().patcher;
	const saved = structuredClone(expected);
	const query = saved.boxes.find(({ box }) => box.id === "get-colors").box;
	query.text = query.text.replace(/"(live_[a-z_]+)"/g, "$1");
	verifyPatcher(saved, expected, { nativeSaved: true });
	assert.throws(() => verifyPatcher(saved, expected), /get-colors: text changed/);
	query.text = query.text.replace("live_surface_bg", "live_control_bg");
	assert.throws(
		() => verifyPatcher(saved, expected, { nativeSaved: true }),
		/get-colors: text changed/,
	);
	const unrelated = structuredClone(expected);
	unrelated.boxes.find(({ box }) => box.id === "init").box.text = '"init"';
	assert.throws(
		() => verifyPatcher(unrelated, expected, { nativeSaved: true }),
		/init: text changed/,
	);
});

// Supply the actual Max-saved artifact for release acceptance. No user account,
// generated conversation, or large binary fixture is checked into the repository.
test("native frozen candidate matches build and rejects corruption", {
	skip: !process.env.MIDI_JOURNEY_FROZEN_CANDIDATE,
}, async () => {
	const file = process.env.MIDI_JOURNEY_FROZEN_CANDIDATE;
	const result = await verifyFrozen(file);
	assert.equal(result.validation.amxdType, 0x61616161);
	const bytes = await readFile(file);
	const parsed = frozen.inspectFrozenAmxd(bytes);
	assert.deepEqual(
		parsed.nativeEntries.map((entry) => entry.name).sort(),
		RUNTIME_FILES.filter((name) => name !== "midijourney-server.js").sort(),
	);
	const invalidDirectory = Buffer.from(bytes);
	invalidDirectory.writeUInt32BE(bytes.length, 44);
	assert.throws(() => frozen.inspectFrozenAmxd(invalidDirectory), /directory/);
	const invalidZip = Buffer.from(bytes);
	invalidZip[parsed.validation.zipOffset + 14] ^= 1;
	assert.throws(() => frozen.inspectFrozenAmxd(invalidZip));
	const native = parsed.nativeBundles[0];
	const invalidNativeZip = Buffer.from(bytes);
	invalidNativeZip[native.zipfile.byteOffset - bytes.byteOffset + 14] ^= 1;
	assert.throws(() => frozen.inspectFrozenAmxd(invalidNativeZip));
	const directory = await mkdtemp(join(tmpdir(), "midi-journey-freeze-test-"));
	try {
		const altered = Buffer.from(bytes);
		const script = parsed.nativeEntries.find(
			(entry) => entry.name === "midijourney-panel.js",
		).data;
		altered[script.byteOffset - bytes.byteOffset] ^= 1;
		const path = join(directory, "altered.amxd");
		await writeFile(path, altered);
		await assert.rejects(
			verifyFrozen(path),
			/Native midijourney-panel.js differs/,
		);
		for (const part of ["executable", "plist"]) {
			const corruptNative = Buffer.from(bytes);
			corruptNative[native[part].byteOffset - bytes.byteOffset] ^= 1;
			await writeFile(path, corruptNative);
			await assert.rejects(verifyFrozen(path), new RegExp(`Native ${part} differs`));
		}
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("frozen patch validation rejects missing connections, UI changes, and stale runtime paths", () => {
	const expected = makeDevice().patcher;
	verifyPatcher(structuredClone(expected), expected);
	const disconnected = structuredClone(expected);
	disconnected.lines.pop();
	assert.throws(() => verifyPatcher(disconnected, expected), /patch cords/);
	const renamed = structuredClone(expected);
	renamed.boxes.find(({ box }) => box.id === "controls").box.presentation_rect =
		[0, 0, 100, 100];
	assert.throws(() => verifyPatcher(renamed, expected), /changed/);
	const stale = structuredClone(expected);
	stale.boxes.find(({ box }) => box.id === "server").box.text =
		"node.script /old/path.js";
	assert.throws(() => verifyPatcher(stale, expected), /changed/);
});

test("release verification rejects local-agent candidates", async () => {
	const manifest = await verifyBuild();
	const directory = await mkdtemp(join(tmpdir(), "mj-local-release-"));
	try {
		await writeFile(
			join(directory, "build-manifest.json"),
			JSON.stringify({
				...manifest,
				configured: true,
				agentBaseUrl: "http://127.0.0.1:5180",
			}),
		);
		await assert.rejects(
			verifyBuild(directory, { requireConfigured: true }),
			/Release cannot use the local test agent/,
		);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
