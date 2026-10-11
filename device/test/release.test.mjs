import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { makeDevice } from "../../scripts/device.mjs";
import frozen from "../../scripts/frozen-amxd.cjs";
import {
	MEDIA_FILES,
	verifyBuild,
	verifyFrozen,
	verifyPatcher,
} from "../../scripts/release-lib.mjs";

test("build manifest binds every production output, and an editable device is not a frozen release", async () => {
	const manifest = await verifyBuild();
	assert.equal(MEDIA_FILES.length, 4);
	let total = 0;
	for (const name of MEDIA_FILES) {
		assert.ok(manifest.files[name]);
		const artwork = await readFile(
			new URL(`../../dist/${name}`, import.meta.url),
		);
		assert.equal(artwork.subarray(1, 4).toString(), "PNG");
		assert.equal(artwork.readUInt32BE(16), 338);
		assert.equal(artwork.readUInt32BE(20), 338);
		assert.ok(artwork.length < 50_000, `${name} must stay lightweight`);
		total += artwork.length;
	}
	assert.ok(total < 160_000);
	const source = await readFile(
		new URL("../../dist/Midi Journey 2.source.amxd", import.meta.url),
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
	assert.equal(parsed.nativeEntries.length, 7);
	const invalidDirectory = Buffer.from(bytes);
	invalidDirectory.writeUInt32BE(bytes.length, 44);
	assert.throws(() => frozen.inspectFrozenAmxd(invalidDirectory), /directory/);
	const invalidZip = Buffer.from(bytes);
	invalidZip[parsed.validation.zipOffset + 14] ^= 1;
	assert.throws(() => frozen.inspectFrozenAmxd(invalidZip));
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
	renamed.boxes.find(({ box }) => box.id === "open").box.text = "Old UI";
	assert.throws(() => verifyPatcher(renamed, expected), /changed/);
	const stale = structuredClone(expected);
	stale.boxes.find(({ box }) => box.id === "server").box.text =
		"node.script /old/path.js";
	assert.throws(() => verifyPatcher(stale, expected), /changed/);
	const staleArt = structuredClone(expected);
	staleArt.boxes.find(({ box }) => box.id === "artwork").box.pic =
		"missing.png";
	assert.throws(() => verifyPatcher(staleArt, expected), /changed/);
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
