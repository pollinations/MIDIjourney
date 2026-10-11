import assert from "node:assert/strict";
import test from "node:test";
import { PollinationsMidiClient } from "../.generated/midi-core.mjs";
import { createChatSession } from "../src/chat-session.mjs";
import { midiInputsFeedback, resolveMidiInputs } from "../src/midi-input.mjs";
import { normalizeChat } from "../src/session.mjs";

const note = { pitch: 60, start_time: 0, duration: 1, velocity: 81.5 };
const first = {
	title: "Bass",
	duration: 8,
	notes: [note, { ...note, pitch: 67, mute: 1 }],
};
const second = {
	title: "Chords",
	duration: 16,
	notes: [
		{ ...note, pitch: 72 },
		{ ...note, pitch: 76 },
	],
};
const reply = {
	title: "Combined",
	explanation: "A musical combination.",
	key: null,
	duration: 8,
	notes: [{ ...note, velocity: 90 }],
};
const context = (source = first, id = "1") => ({
	connected: true,
	sourceId: id,
	source,
});
function harness() {
	let live = context();
	const requests = [];
	const session = createChatSession({
		initial: normalizeChat(null),
		readContext: async () => live,
		createGenerator: () =>
			new PollinationsMidiClient({
				auth: {
					requireClient: () => ({
						chat: async (messages) => {
							requests.push(JSON.parse(messages.at(-1).content));
							return {
								model: "fixture",
								choices: [{ message: { content: JSON.stringify(reply) } }],
							};
						},
					}),
				},
			}),
	});
	return {
		session,
		requests,
		setLive: (value) => {
			live = value;
		},
		feedback: () =>
			resolveMidiInputs(
				live,
				session.getSnapshot().turns,
				session.getSnapshot(),
			),
	};
}

test("badges replace the old clip as Live selection changes, without collecting snapshots", async () => {
	const h = harness();
	assert.deepEqual(
		h.feedback().items.map((item) => item.summary.title),
		["Bass"],
	);
	h.setLive(context(second, "2"));
	assert.deepEqual(
		h.feedback().items.map((item) => item.summary.title),
		["Chords"],
	);
	h.session.setDraft("Use the current selection");
	await h.session.generate();
	assert.equal(h.requests[0].sourceClip.title, "Chords");
	assert.equal(h.requests[0].sourceClip.notes.length, 2);
	assert.equal("sourceClips" in h.requests[0], false);
	assert.equal(typeof h.session.keepInput, "undefined");
	assert.equal(typeof h.session.removeInput, "undefined");
});

test("clearing selection removes badges and sends no MIDI, even after a successful reply", async () => {
	const h = harness();
	h.session.setDraft("First idea");
	await h.session.generate();
	h.setLive(context(null, ""));
	assert.deepEqual(h.feedback().items, []);
	h.session.setDraft("Now text only");
	await h.session.generate();
	assert.equal(h.requests[1].sourceClip, null);
	assert.deepEqual(h.session.getSnapshot().turns[1].inputs, []);
	assert.equal(h.session.getSnapshot().turns[1].basedOn, "");
	assert.ok(
		h.session.getSnapshot().context.length > 0,
		"keep the conversation, not fallback attachments",
	);
	assert.deepEqual(h.session.getSnapshot().turns[0].inputs, [
		{ kind: "live", title: "Bass", noteCount: 1 },
	]);
});

test("old saved pins and exclusions are ignored without deleting the chat or sent receipts", async () => {
	const h = harness();
	h.session.setDraft("Keep my conversation");
	await h.session.generate();
	const raw = {
		...h.session.getSnapshot(),
		draft: "Unsent text",
		attachments: [{ key: "live:1", source: first }],
		excludedInputs: ["live:2"],
	};
	const loaded = normalizeChat(raw);
	assert.equal("attachments" in loaded, false);
	assert.equal("excludedInputs" in loaded, false);
	assert.equal(loaded.draft, "Unsent text");
	assert.equal(loaded.turns[0].inputs[0].title, "Bass");
	assert.equal(loaded.turns[0].result.title, reply.title);
	assert.deepEqual(
		resolveMidiInputs(context(null), loaded.turns, raw).items,
		[],
	);
	assert.equal(
		resolveMidiInputs(context(second, "2"), loaded.turns, raw).items[0].summary
			.title,
		"Chords",
	);
});

test("Send freshly reads edits and selection, rather than reusing the rendered badge", async () => {
	const h = harness();
	assert.equal(h.feedback().items[0].summary.noteCount, 1);
	h.setLive(context({ ...second, title: "Edited before Send" }, "2"));
	h.session.setDraft("Use the latest");
	await h.session.generate();
	assert.equal(h.requests[0].sourceClip.title, "Edited before Send");
	assert.equal(h.requests[0].sourceClip.notes.length, 2);
	assert.deepEqual(h.session.getSnapshot().turns[0].inputs, [
		{ kind: "live", title: "Edited before Send", noteCount: 2 },
	]);
});

test("unreadable or checking input hides stale badges and blocks generation", async () => {
	const h = harness();
	for (const live of [
		{ ...context(), checking: true },
		{ ...context(), sourceError: "Cannot read selection" },
	]) {
		h.setLive(live);
		assert.deepEqual(midiInputsFeedback(live).items, []);
		h.session.setDraft("Do not use stale MIDI");
		await h.session.generate();
		assert.equal(h.requests.length, 0);
		assert.equal(h.session.getSnapshot().turns.at(-1).status, "failed");
	}
});

test("a late selection read cannot repopulate a new chat or disposed session", async () => {
	let finish,
		calls = 0;
	const session = createChatSession({
		initial: normalizeChat(null),
		readContext: () =>
			new Promise((done) => {
				finish = done;
			}),
		createGenerator: () => {
			calls++;
			throw new Error("Must not run");
		},
	});
	session.setDraft("Old message");
	let pending = session.generate();
	session.newChat();
	finish(context());
	await pending;
	assert.equal(calls, 0);
	assert.deepEqual(session.getSnapshot().turns, []);
	session.setDraft("Another old message");
	pending = session.generate();
	session.dispose();
	session.activate();
	finish(context(second));
	await pending;
	assert.equal(calls, 0);
});

test("failure and cancellation do not retain the previous selection for a retry", async () => {
	let live = context(),
		reject;
	const inputs = [];
	const session = createChatSession({
		initial: normalizeChat(null),
		readContext: async () => live,
		createGenerator: () => ({
			generate: (input) => {
				inputs.push(input);
				return new Promise((_resolve, fail) => {
					reject = fail;
				});
			},
			cancel() {},
		}),
	});
	session.setDraft("Try this");
	let pending = session.generate();
	await Promise.resolve();
	reject(new Error("Fixture failure"));
	await pending;
	live = context(null);
	session.setDraft("Try text only");
	pending = session.generate();
	await Promise.resolve();
	assert.deepEqual(inputs[1].notes, []);
	assert.equal(inputs[1].title, "");
	session.cancel();
	reject(new Error("Canceled"));
	await pending;
	assert.deepEqual(
		resolveMidiInputs(live, session.getSnapshot().turns).items,
		[],
	);
});

test("sent MIDI and receipts stay fixed while the next composer follows Live", async () => {
	const h = harness();
	const selected = structuredClone(first);
	h.setLive(context(selected));
	h.session.setDraft("Use the bass");
	await h.session.generate();
	selected.title = "Later edit";
	selected.notes[0].pitch = 42;
	h.setLive(context(second, "2"));
	const restored = normalizeChat(h.session.getSnapshot());
	assert.equal(h.requests[0].sourceClip.notes[0].pitch, 60);
	assert.equal(h.requests[0].sourceClip.notes[0].velocity, 81.5);
	assert.deepEqual(restored.turns[0].inputs, [
		{ kind: "live", title: "Bass", noteCount: 1 },
	]);
	assert.equal(h.feedback().items[0].summary.title, "Chords");
	h.session.newChat();
	assert.equal(
		h.feedback().items[0].summary.title,
		"Chords",
		"New chat does not change Live selection",
	);
});
