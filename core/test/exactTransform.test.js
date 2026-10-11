const test = require("node:test");
const assert = require("node:assert/strict");
const { parseTranspose, tryExactTransform } = require("../exactTransform");
const { buildRequest } = require("../history");
const { PollinationsMidiClient } = require("../pollinationsClient");

const source = {
	title: "Original",
	key: "E minor",
	duration: 8,
	notes: [
		{ pitch: 64, start_time: 0.125, duration: 1.375, velocity: 87 },
		{ pitch: 71, start_time: 2.875, duration: 2.125, velocity: 64 },
	],
};

test("whole-request transpositions recognize explicit direction and same-mode keys", () => {
	for (const [text, semitones] of [
		["Please transpose up an octave.", 12],
		["Shift the notes down 2 semitones", -2],
		["Move it up two octaves, please", 24],
		["Transpose from E minor to D minor", -2],
		["Transpose from Bb major to C major", 2],
	])
		assert.equal(parseTranspose(text).semitones, semitones);
	for (const text of [
		"Don't transpose up an octave",
		"Should I transpose up an octave?",
		"Transpose up an octave and make it jazzy",
		"Use Claude to transpose up an octave",
		"Transpose from C major to C minor",
		"Transpose from C major to F# major",
		"Explain what transpose up an octave means",
		"Transpose down 1.5 semitones",
	])
		assert.equal(parseTranspose(text), null, text);
});

test("exact edits preserve source timing/dynamics, never mutate input, and cost no API call", async () => {
	const original = structuredClone(source);
	let calls = 0;
	const generator = new PollinationsMidiClient({
		auth: {
			requireClient() {
				calls++;
				throw new Error("No API allowed");
			},
		},
	});
	const output = await generator.generate({
		...source,
		promptText: "Transpose from E minor to D minor",
	});
	assert.equal(calls, 0);
	assert.equal(output.key, "D minor");
	assert.equal(output.duration, source.duration);
	assert.deepEqual(
		output.notes,
		source.notes.map((note) => ({ ...note, pitch: note.pitch - 2, mute: 0 })),
	);
	assert.deepEqual(source, original);
	assert.equal(output.history.length, 2);
	assert.match(output.explanation, /without an AI call/);
});

test("local transposition refuses lossy or unrepresentable source data", () => {
	for (const changed of [
		{ ...source, notes: [{ ...source.notes[0], pitch: 126 }] },
		{ ...source, notes: [{ ...source.notes[0], velocity: 64.5 }] },
		{ ...source, notes: [{ ...source.notes[0], mute: 1 }, source.notes[1]] },
		{ ...source, notes: [{ ...source.notes[0], probability: 0.5 }] },
		{ ...source, notes: [{ ...source.notes[0], duration: 10 }] },
		{ ...source, exactTransformUnsafe: true },
	]) {
		const input = { ...changed, promptText: "Transpose up an octave" };
		const output = tryExactTransform(buildRequest(input), input);
		assert.equal(output.midi, null);
		assert.ok(output.text);
	}
});

test("missing and multiple source clips ask for one selection instead of generating substitutes", async () => {
	const generator = new PollinationsMidiClient({
		auth: {
			requireClient() {
				throw new Error("No API allowed");
			},
		},
	});
	for (const input of [{}, { sourceClips: [source, source] }]) {
		const result = await generator.generate({
			...input,
			promptText: "Transpose up an octave",
		});
		assert.equal(result.notes, undefined);
		assert.match(result.text, /Select one MIDI clip/);
	}
});
