import assert from "node:assert/strict";
import test from "node:test";
import { CONFIG } from "../.generated/midi-core.mjs";
import { createChatSession } from "../src/chat-session.mjs";
import { midiBadgeStyle } from "../src/midi-color.mjs";
import {
	midiInputFeedback,
	normalizeMidiInput,
	resolveMidiInput,
} from "../src/midi-input.mjs";
import { normalizeChat } from "../src/session.mjs";

const note = { pitch: 60, start_time: 0, duration: 1, velocity: 81.5 };
const source = {
	title: "Selected piano",
	duration: 8,
	notes: [note, { ...note, pitch: 67, mute: 1 }],
};
const reply = {
	...source,
	title: "Earlier reply",
	notes: [note],
	explanation: "Music",
	key: null,
};

test("visible MIDI feedback uses the same source rule and sanitized count as the request", () => {
	const turns = [{ result: reply }],
		live = { connected: false, source };
	const before = structuredClone(source);
	assert.deepEqual(midiInputFeedback(live, turns).summary, {
		kind: "live",
		title: source.title,
		noteCount: 1,
	});
	assert.equal(resolveMidiInput(live, turns).source, source);
	assert.deepEqual(midiInputFeedback({ connected: true }, turns).summary, {
		kind: "none",
		title: "",
		noteCount: 0,
	});
	assert.deepEqual(midiInputFeedback({ connected: true }, []).summary, {
		kind: "none",
		title: "",
		noteCount: 0,
	});
	assert.deepEqual(source, before);
});

test("checking, unreadable, and invalid MIDI do not present another clip as ready", () => {
	const turns = [{ result: reply }];
	assert.deepEqual(midiInputFeedback({ checking: true }, turns), {
		checking: true,
	});
	assert.match(
		midiInputFeedback({ sourceError: "Connector unavailable" }, turns).error,
		/Connector unavailable/,
	);
	assert.match(
		midiInputFeedback(
			{ source: { ...source, notes: [{ ...note, pitch: -1 }] } },
			turns,
		).error,
		/invalid MIDI/,
	);
	assert.equal(
		midiInputFeedback({ source: { ...source, notes: [] } }, turns).summary
			.noteCount,
		0,
	);
});

test("feedback obeys the original input limit rather than counting all raw or muted notes", () => {
	const notes = Array.from({ length: CONFIG.maxInputNotes + 5 }, () => ({
		...note,
	}));
	notes[0].mute = true;
	assert.equal(
		midiInputFeedback({ source: { ...source, notes } }, []).summary.noteCount,
		CONFIG.maxInputNotes - 1,
	);
});

test("message input receipt comes from the Send-time read and stays fixed after edits/selection changes", async () => {
	let current = structuredClone(source),
		finish,
		sent;
	const session = createChatSession({
		initial: normalizeChat(null),
		readContext: async () => ({ connected: true, source: current }),
		createGenerator: () => ({
			generate(input) {
				sent = input;
				return new Promise((resolve) => {
					finish = resolve;
				});
			},
		}),
	});
	const preview = midiInputFeedback({ source: current }, []).summary;
	current = {
		...source,
		title: "Edited before sending",
		notes: [note, { ...note, pitch: 72 }],
	};
	session.setDraft("Use these notes");
	const pending = session.generate();
	await Promise.resolve();
	const receipt = session.getSnapshot().turns[0].input;
	assert.equal(preview.title, source.title);
	assert.deepEqual(receipt, {
		kind: "live",
		title: current.title,
		noteCount: sent.notes.length,
	});
	current.title = "Changed during generation";
	current.notes.push({ ...note, pitch: 74 });
	assert.equal(receipt.title, "Edited before sending");
	assert.equal(receipt.noteCount, 2);
	finish({ ...reply, history: [] });
	await pending;
	assert.deepEqual(
		normalizeChat(session.getSnapshot()).turns[0].input,
		receipt,
	);
});

test("saved input receipts are bounded and old exchanges never invent attachment metadata", () => {
	assert.equal(
		normalizeMidiInput({ kind: "live", title: "x", noteCount: -1 }),
		undefined,
	);
	assert.equal(
		normalizeMidiInput({ kind: "invented", title: "x", noteCount: 1 }),
		undefined,
	);
	assert.equal(
		normalizeMidiInput({
			kind: "live",
			title: "x",
			noteCount: CONFIG.maxInputNotes + 1,
		}),
		undefined,
	);
	const saved = normalizeMidiInput({
		kind: "live",
		title: "x".repeat(1000),
		noteCount: 1,
		notes: [note],
		apiKey: "excluded",
	});
	assert.equal(saved.title.length, CONFIG.maxTitleLength);
	assert.equal("notes" in saved, false);
	assert.equal("apiKey" in saved, false);
	assert.equal(
		normalizeChat({
			turns: [{ prompt: "Old prompt", basedOn: "Old clip", result: reply }],
		}).turns[0].input,
		undefined,
	);
});

test("clip badge keeps real RGB colors and readable text, with a neutral fallback", () => {
	assert.deepEqual(midiBadgeStyle(0), {
		backgroundColor: "#000000",
		color: "#ffffff",
	});
	assert.deepEqual(midiBadgeStyle(0xffffff), {
		backgroundColor: "#ffffff",
		color: "#000000",
	});
	assert.deepEqual(midiBadgeStyle(0xff33d8), {
		backgroundColor: "#ff33d8",
		color: "#000000",
	});
	for (const color of [null, undefined, -1, 0x1000000, 1.5, "#ffffff"])
		assert.equal(midiBadgeStyle(color), undefined);
	const summary = midiInputFeedback({
		source: { ...source, color: 0xff33d8 },
	}).summary;
	assert.equal(summary.color, 0xff33d8);
	assert.equal(normalizeMidiInput(summary).color, summary.color);
});
