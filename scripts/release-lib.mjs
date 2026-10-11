import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sourceFingerprint } from "./source-fingerprint.mjs";

const require = createRequire(import.meta.url);
const { inspectFrozenAmxd } = require("./frozen-amxd.cjs");
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const RUNTIME_FILES = [
	"midijourney-server.js",
	"midijourney-bridge.js",
	"midijourney-window.js",
	"midijourney-panel.js",
];
export const MEDIA_FILES = [
	"open-connected",
	"open-disconnected",
	"close-connected",
	"close-disconnected",
].map((state) => `midijourney-${state}.png`);
export const EMBEDDED_FILES = [...RUNTIME_FILES, ...MEDIA_FILES];
export const BUILD_FILES = [
	...EMBEDDED_FILES,
	"Midi Journey 2.maxpat",
	"Midi Journey 2.source.amxd",
];
export const sha256 = (value) =>
	createHash("sha256").update(value).digest("hex");

export async function verifyBuild(
	directory = resolve(ROOT, "dist"),
	{ requireConfigured = false } = {},
) {
	const manifest = JSON.parse(
		await readFile(resolve(directory, "build-manifest.json"), "utf8"),
	);
	assert.equal(manifest.format, "midi-journey-build-v1");
	assert.equal(manifest.version, "3.0.0");
	const { CONFIG, hasConfiguredAppKey } = require("../core/config.js");
	assert.equal(
		manifest.source,
		await sourceFingerprint(ROOT, hasConfiguredAppKey() ? CONFIG.appKey : ""),
		"Source changed since the candidate was built; rebuild before freezing or verifying.",
	);
	assert.deepEqual(Object.keys(manifest.files).sort(), [...BUILD_FILES].sort());
	if (requireConfigured) {
		assert.equal(
			manifest.configured,
			true,
			"Release requires the existing authorized publishable app-key configuration.",
		);
		assert.equal(
			manifest.agentBaseUrl,
			"https://gen.pollinations.ai",
			"Release cannot use the local test agent.",
		);
		assert.equal(
			manifest.agentModel,
			CONFIG.defaultModel,
			"Release agent model differs from the configured agent.",
		);
	}
	for (const name of BUILD_FILES)
		assert.equal(
			sha256(await readFile(resolve(directory, name))),
			manifest.files[name],
			`Stale build: ${name}`,
		);
	return manifest;
}

// Max may add editor metadata while freezing. Compare every functional box,
// nested patcher, UI property, and connection rather than incidental editor state.
export function verifyPatcher(actual, expected, { nativeSaved = false } = {}) {
	for (const key of [
		"devicewidth",
		"minimum_live_version",
		"minimum_max_version",
		"title",
	])
		if (expected[key] !== undefined) {
			// Max's native serializer omits these source-only version hints.
			if (
				nativeSaved &&
				key.startsWith("minimum_") &&
				actual[key] === undefined
			)
				continue;
			assert.deepEqual(actual[key], expected[key], `Patcher ${key} changed`);
		}
	const boxes = new Map(actual.boxes.map(({ box }) => [box.id, box]));
	assert.equal(
		boxes.size,
		expected.boxes.length,
		"Frozen device box count changed",
	);
	for (const { box } of expected.boxes) {
		let found = boxes.get(box.id);
		assert.ok(found, `Missing box ${box.id}`);
		// Typed inlet/outlet objects are Max's serialization of these newobj boxes.
		if (
			nativeSaved &&
			box.maxclass === "newobj" &&
			["inlet", "outlet"].includes(box.text) &&
			found.maxclass === box.text &&
			found.text === undefined
		)
			found = { ...found, maxclass: "newobj", text: box.text };
		for (const key of [
			"maxclass",
			"text",
			"texton",
			"varname",
			"presentation",
			"presentation_rect",
			"pic",
			"autofit",
			"ignoreclick",
			"bgcolor",
			"bgoncolor",
			"offcolor",
			"oncolor",
		])
			if (box[key] !== undefined)
				assert.deepEqual(found[key], box[key], `Box ${box.id}: ${key} changed`);
		if (box.patcher) verifyPatcher(found.patcher, box.patcher, { nativeSaved });
	}
	const connections = (p) =>
		p.lines
			.map(({ patchline: l }) => JSON.stringify([l.source, l.destination]))
			.sort();
	assert.deepEqual(
		connections(actual),
		connections(expected),
		"Frozen patch cords changed",
	);
}

export async function verifyFrozen(file, directory = resolve(ROOT, "dist")) {
	const manifest = await verifyBuild(directory, { requireConfigured: true });
	const buffer = await readFile(file);
	const frozen = inspectFrozenAmxd(buffer);
	const patcher = JSON.parse(
		await readFile(resolve(directory, "Midi Journey 2.maxpat"), "utf8"),
	).patcher;
	for (const document of frozen.documents)
		verifyPatcher(document.patcher, patcher, { nativeSaved: true });
	assert.equal(
		buffer.toString("ascii", 8, 12),
		"aaaa",
		"Release must be a Max Audio Effect for Main",
	);
	for (const name of EMBEDDED_FILES) {
		const entries = frozen.entries.filter(
			(entry) => basename(entry.name) === name,
		);
		assert.equal(entries.length, 1, `Expected exactly one embedded ${name}`);
		assert.equal(
			sha256(entries[0].data),
			manifest.files[name],
			`Embedded ${name} differs from the build`,
		);
	}
	for (const entry of frozen.nativeEntries ?? []) {
		assert.ok(
			EMBEDDED_FILES.includes(entry.name),
			`Unexpected native resource: ${entry.name}`,
		);
		assert.equal(
			sha256(entry.data),
			manifest.files[entry.name],
			`Native ${entry.name} differs from the build`,
		);
	}
	const extraPatchers = frozen.entries.filter(
		(entry) => entry.name === "patchers/Midi Journey 2.maxpat",
	);
	assert.ok(extraPatchers.length <= 1, "Duplicate project patcher");
	for (const entry of extraPatchers)
		verifyPatcher(JSON.parse(entry.data.toString("utf8")).patcher, patcher, {
			nativeSaved: true,
		});
	const metadata = frozen.entries.filter((entry) =>
		entry.name.startsWith("__MACOSX/"),
	);
	// Max adds an AppleDouble record containing only macOS provenance. Reject
	// arbitrary extended attributes or resource forks, not merely their names.
	const provenancePrefix = Buffer.from(
		"00051607000200004d6163204f5320582020202020202020000200000009000000320000007100000002000000a300000000000000000000000000000000000000000000000000000000000000000000000000004154545200000000000000a3000000980000000b00000000000000000000000000000001000000980000000b000015636f6d2e6170706c652e70726f76656e616e636500",
		"hex",
	);
	for (const entry of metadata) {
		assert.equal(
			entry.data.length,
			provenancePrefix.length + 11,
			"Unexpected macOS metadata length",
		);
		assert.ok(
			entry.data.subarray(0, provenancePrefix.length).equals(provenancePrefix),
			"Unexpected macOS extended attributes",
		);
		const original = entry.name
			.replace(/^__MACOSX\//, "")
			.replace(/\/\._([^/]+)$/, "/$1");
		assert.ok(
			frozen.entries.some((other) => other.name === original),
			"Orphan macOS metadata",
		);
	}
	const unexpected = frozen.entries.filter(
		(entry) =>
			!entry.name.endsWith("/") &&
			!EMBEDDED_FILES.includes(basename(entry.name)) &&
			!extraPatchers.includes(entry) &&
			!metadata.includes(entry),
	);
	assert.equal(unexpected.length, 0, "Unexpected files embedded in device");
	return {
		version: manifest.version,
		sha256: sha256(buffer),
		bytes: buffer.length,
		embeddedFiles: EMBEDDED_FILES,
		validation: frozen.validation,
	};
}
