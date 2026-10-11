import assert from "node:assert/strict";
import test from "node:test";
import { observeChat, upsertCall } from "../src/call-log.mjs";
import {
	captureReply,
	MAX_REPLY_CHARS,
} from "../src/response-diagnostics.mjs";
import {
	KEY_WIDTH,
	pianoRoll,
	ROLL_HEIGHT,
	ROLL_WIDTH,
} from "../src/piano-roll.mjs";
import { normalizeChat } from "../src/session.mjs";

const note = { pitch: 60, start_time: 0, duration: 1, velocity: 90 };
const clip = {
	title: "Phrase",
	explanation: "Soft notes",
	key: "C major",
	duration: 8,
	notes: [note],
};

test("piano roll plots time/duration horizontally and pitch vertically without changing notes", () => {
	const notes = [note, { ...note, pitch: 72, start_time: 4, duration: 2 }];
	const before = JSON.stringify(notes);
	const roll = pianoRoll(notes, 8);
	assert.equal(roll.notes[0].x, KEY_WIDTH);
	assert.equal(roll.notes[1].x, KEY_WIDTH + (ROLL_WIDTH - KEY_WIDTH) / 2);
	assert.equal(roll.notes[1].width, roll.notes[0].width * 2);
	assert.ok(roll.notes[1].y < roll.notes[0].y);
	assert.equal(JSON.stringify(notes), before);
});

test("piano roll handles single-pitch, full MIDI range and dense output with bounded geometry", () => {
	for (const notes of [
		[note],
		[
			{ ...note, pitch: 0 },
			{ ...note, pitch: 127 },
		],
		Array(2048).fill(note),
	]) {
		const roll = pianoRoll(notes, 4096);
		assert.equal(roll.notes.length, notes.length);
		assert.ok(roll.grid.length <= 16);
		assert.ok(roll.low >= 0 && roll.high <= 127);
		assert.ok(roll.displayHeight >= 112 && roll.displayHeight <= 144);
		for (const item of roll.notes) {
			assert.ok(item.width > 0 && item.height > 0);
			assert.ok(item.x >= KEY_WIDTH && item.x + item.width <= ROLL_WIDTH);
			assert.ok(item.y >= 0 && item.y + item.height <= ROLL_HEIGHT);
		}
	}
	assert.equal(pianoRoll([], 8), null);
	assert.equal(pianoRoll([{ ...note, pitch: -1 }], 8), null);
	assert.equal(pianoRoll([{ ...note, duration: Infinity }], 8), null);
});

test("piano roll gives ordinary phrases substantial notes without faint velocities or oversized previews", () => {
	const roll = pianoRoll(
		[
			{ ...note, pitch: 48, velocity: 1 },
			{ ...note, pitch: 72, velocity: 127 },
		],
		8,
	);
	for (const item of roll.notes) {
		assert.ok((item.height * roll.displayHeight) / ROLL_HEIGHT >= 4);
		assert.ok(item.opacity >= 0.72 && item.opacity <= 1);
	}
	assert.ok(roll.notes[1].opacity > roll.notes[0].opacity);
	const short = pianoRoll([{ ...note, duration: 0.001 }], 8);
	assert.equal(short.notes[0].width, 2);
	const nearEnd = pianoRoll(
		[{ ...note, start_time: 7.999, duration: 0.001 }],
		8,
	);
	assert.ok(nearEnd.notes[0].x + nearEnd.notes[0].width <= ROLL_WIDTH);
});

test("diagnostics retain the exact provider message and usage but no request or auth fields", async () => {
	const midi = { ...clip, notes: Array(180).fill(note) };
	const raw = `\n${JSON.stringify(midi, null, 4)}\n`;
	const response = {
		model: "served-model",
		choices: [{ message: { content: raw }, finish_reason: "stop" }],
		usage: { prompt_tokens: 12, completion_tokens: 34, total_tokens: 46 },
		apiKey: "not-for-copy",
	};
	let calls = [];
	const client = observeChat(
		{ chat: async () => response },
		(entry) => {
			calls = upsertCall(calls, entry);
		},
		() => 1,
	);
	assert.equal(
		await client.chat([{ content: "not-for-copy-prompt" }], {
			apiKey: "not-for-copy",
		}),
		response,
	);
	assert.equal(calls[0].reply.text, raw);
	assert.equal(calls[0].reply.status, "original");
	assert.equal(calls[0].model, "served-model");
	assert.equal(calls[0].usage.total, 46);
	assert.equal(midi.notes.length, 180);
	assert.doesNotMatch(JSON.stringify(calls), /not-for-copy|apiKey/);
	const saved = normalizeChat({
		turns: [{ id: "x", prompt: "x", result: midi, calls }],
	});
	assert.equal(saved.turns[0].calls[0].reply.text, raw);
});

test("oversized and absent replies are not silently truncated or reconstructed", () => {
	assert.equal(captureReply("a".repeat(MAX_REPLY_CHARS + 1)).text, null);
	assert.deepEqual(captureReply(undefined), { text: null, status: "not retained" });
	assert.equal(
		captureReply("\nnot valid MIDI JSON\n").text,
		"\nnot valid MIDI JSON\n",
	);
});

test("cancelled requests cannot capture a late reply and observer errors do not break generation", async () => {
	let resolve;
	let calls = [];
	const signal = new AbortController();
	const client = observeChat(
		{
			chat: () =>
				new Promise((done) => {
					resolve = done;
				}),
		},
		(entry) => {
			calls = upsertCall(calls, entry);
		},
		() => 1,
	);
	const pending = client.chat([], { signal: signal.signal });
	signal.abort();
	resolve({ choices: [{ message: { content: JSON.stringify(clip) } }] });
	await pending;
	assert.equal(calls[0].status, "Canceled");
	assert.equal(calls[0].reply, undefined);
	const original = { choices: [{ message: { content: "x" } }] };
	const observed = observeChat(
		{ chat: async () => original },
		() => {
			throw new Error("diagnostic only");
		},
		() => 1,
	);
	assert.equal(await observed.chat([], {}), original);
});
