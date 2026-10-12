import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { createChatSession } from "../src/chat-session.mjs";
import { createClip, currentContext, showEditor } from "../src/jweb.mjs";
import { normalizeChat } from "../src/session.mjs";

const { buildRequest } = createRequire(import.meta.url)(
	"../../core/history.js",
);
const { CONFIG } = createRequire(import.meta.url)("../../core/config.js");

test("Open chat asks Live to show the existing editor", () => {
	const sent = [];
	const host = {
		max: { bindInlet() {}, outlet: (...args) => sent.push(args) },
	};
	showEditor(host);
	assert.deepEqual(sent, [["editor", "show"]]);
	assert.doesNotThrow(() => showEditor({}));
});

const source = await readFile(
	new URL("../../device/bridge.js", import.meta.url),
	"utf8",
);
const fixture = {
	title: "Persistent bridge test",
	duration: 4,
	notes: [
		{ pitch: 60, start_time: 0, duration: 1, velocity: 96 },
		{ pitch: 67, start_time: 2, duration: 1, velocity: 104 },
	],
};
function clipObject(duration, notes = [], name = "") {
	return {
		name: [name],
		is_midi_clip: [1],
		is_recording: [0],
		is_overdubbing: [0],
		looping: [1],
		loop_start: [0],
		loop_end: [duration],
		start_marker: [0],
		end_marker: [duration],
		length: [duration],
		notes: structuredClone(notes),
	};
}
function harness(onWire) {
	const objects = new Map([
		[
			1,
			{
				selected_track: ["id", 10],
				highlighted_clip_slot: ["id", 20],
				detail_clip: ["id", 0],
			},
		],
		[2, {}],
		[3, { focused_document_view: ["Session"] }],
		[
			10,
			{ name: ["One"], has_midi_input: [1], clip_slots: ["id", 20, "id", 21] },
		],
		[11, { name: ["Two"], has_midi_input: [1], clip_slots: ["id", 22] }],
		[12, { name: ["Audio"], has_midi_input: [0] }],
		[20, { canonical_parent: ["id", 10], has_clip: [0], clip: ["id", 0] }],
		[21, { canonical_parent: ["id", 10], has_clip: [0], clip: ["id", 0] }],
		[22, { canonical_parent: ["id", 11], has_clip: [0], clip: ["id", 0] }],
	]);
	const calls = [],
		responses = [],
		queue = [],
		dicts = new Map(),
		faults = {};
	let counter = 100;
	class Dict {
		constructor(name) {
			this.name = name || `dict-${++counter}`;
		}
		parse(raw) {
			dicts.set(this.name, JSON.parse(raw));
		}
		stringify() {
			return JSON.stringify(dicts.get(this.name));
		}
		freepeer() {
			dicts.delete(this.name);
		}
	}
	class LiveAPI {
		constructor(_, path) {
			this.id =
				path === "live_set view"
					? 1
					: path === "live_set"
						? 2
						: path === "live_app view"
							? 3
							: Number(path.slice(3));
		}
		get(name) {
			if (!objects.has(this.id)) throw new Error("Deleted");
			return objects.get(this.id)[name];
		}
		set(name, value) {
			calls.push([this.id, "set", name]);
			if (faults.set === name)
				throw new Error("Fixture rejected property write");
			const object = objects.get(this.id);
			const pairs = {
				loop_start: "loop_end",
				start_marker: "end_marker",
				loop_end: "loop_start",
				end_marker: "start_marker",
			};
			if (pairs[name]) {
				const other = object[pairs[name]][0];
				assert.ok(
					name.endsWith("start") || name === "start_marker"
						? value < other
						: value > other,
					"Live marker ordering",
				);
			}
			object[name] = [value];
			object.length = [
				object.looping[0]
					? object.loop_end[0] - object.loop_start[0]
					: object.end_marker[0] - object.start_marker[0],
			];
		}
		call(name, ...args) {
			calls.push([this.id, name]);
			const object = objects.get(this.id);
			if (!object) throw new Error("Deleted");
			if (name === "create_clip") {
				assert.equal(object.has_clip[0], 0);
				const id = ++counter;
				objects.set(id, clipObject(args[0]));
				object.clip = ["id", id];
				object.has_clip = [1];
				return;
			}
			if (name === "get_notes_extended" || name === "get_all_notes_extended") {
				if (name === "get_all_notes_extended") assert.equal(args.length, 0);
				const d = new Dict();
				d.parse(JSON.stringify({ notes: object.notes }));
				return ["dictionary", d.name];
			}
			if (name === "add_new_notes") {
				assert.equal(
					args.length,
					1,
					"JS LiveAPI takes one Dict, not a dictionary/name message",
				);
				assert.ok(args[0] instanceof Dict);
				if (faults.add) throw new Error("Fixture rejected notes");
				object.notes.push(...structuredClone(dicts.get(args[0].name).notes));
				return;
			}
			if (name === "remove_notes_extended") {
				if (faults.remove === "throw")
					throw new Error("Fixture rejected removal");
				if (faults.remove !== "ignore") {
					const [pitch, pitches, time, beats] = args;
					object.notes = object.notes.filter(
						(n) =>
							!(
								n.pitch >= pitch &&
								n.pitch < pitch + pitches &&
								n.start_time >= time &&
								n.start_time < time + beats
							),
					);
				}
				return;
			}
			throw new Error(`Unsupported Live API function: ${name}`);
		}
	}
	class Task {
		constructor(fn) {
			this.fn = fn;
		}
		schedule() {
			queue.push(this);
		}
		cancel() {
			this.canceled = true;
		}
	}
	const responseParts = new Map();
	const context = vm.createContext({
		LiveAPI,
		Task,
		Dict,
		Array,
		JSON,
		arrayfromargs: (args) => Array.from(args),
		post() {},
		outlet: (...args) => {
			onWire?.(...args);
			if (args[1] === "response")
				responses.push({ id: args[2], ...JSON.parse(args[3]) });
			if (args[1] === "responsepart") {
				const [, , id, index, total, text] = args;
				const parts = responseParts.get(id) || [];
				assert.equal(index, parts.length);
				parts.push(text);
				responseParts.set(id, parts);
				if (parts.length === total) {
					responses.push({ id, ...JSON.parse(parts.join("")) });
					responseParts.delete(id);
				}
			}
		},
	});
	vm.runInContext(source, context);
	context.init();
	return {
		context,
		objects,
		calls,
		responses,
		faults,
		select(track, slot) {
			objects.get(1).selected_track = ["id", track];
			objects.get(1).highlighted_clip_slot = ["id", slot];
			objects.get(1).detail_clip = objects.get(slot)?.clip || ["id", 0];
		},
		target(fresh = false) {
			context.context("target", fresh);
			return responses.at(-1).context;
		},
		input(notes = fixture.notes) {
			objects.set(30, clipObject(fixture.duration, notes, fixture.title));
			objects.get(20).has_clip = [1];
			objects.get(20).clip = ["id", 30];
			this.select(10, 20);
			return objects.get(30);
		},
		create(id = "create-one", target = this.target().target, clip = fixture) {
			context.create(id, JSON.stringify({ target, clip }));
		},
		flush() {
			let limit = 100;
			while (queue.length && --limit) {
				const t = queue.shift();
				if (!t.canceled) t.fn();
			}
			assert.ok(limit);
		},
	};
}
test("selection follows different slots/tracks without writing", () => {
	const h = harness();
	assert.equal(h.target().destination, "One · empty slot 1");
	h.select(10, 21);
	assert.equal(h.target().destination, "One · empty slot 2");
	h.select(11, 22);
	assert.equal(h.target().destination, "Two · empty slot 1");
	assert.equal(h.calls.length, 0);
});

test("native writer accepts the shared output limits and rejects values beyond them", () => {
	const h = harness();
	const longClip = {
		...fixture,
		title: "x".repeat(CONFIG.maxTitleLength),
		duration: CONFIG.maxClipBeats,
	};
	assert.equal(h.context.validate(longClip).duration, CONFIG.maxClipBeats);
	assert.throws(
		() =>
			h.context.validate({ ...longClip, duration: CONFIG.maxClipBeats + 1 }),
		/Invalid MIDI clip/,
	);
	assert.throws(
		() => h.context.validate({ ...longClip, title: `${longClip.title}x` }),
		/Invalid MIDI clip/,
	);
	assert.throws(
		() =>
			h.context.validate({
				...fixture,
				notes: [{ ...fixture.notes[0], velocity: 80.5 }],
			}),
		/Invalid MIDI note/,
	);
});
test("audio selection invalidates the previous MIDI target", () => {
	const h = harness();
	h.target();
	h.select(12, 20);
	assert.equal(h.target().connected, false);
	h.select(11, 20);
	assert.equal(h.target().connected, false);
});
test("stale destinations and malformed notes never mutate Live", () => {
	const h = harness(),
		old = h.target().target;
	h.select(11, 22);
	h.create("old", old);
	assert.match(h.responses.at(-1).error, /selection changed/);
	h.create("invalid", h.target().target, {
		...fixture,
		notes: [{ ...fixture.notes[0], pitch: -1 }],
	});
	assert.match(h.responses.at(-1).error, /Invalid MIDI note/);
	assert.equal(h.calls.length, 0);
});
test("create acknowledges verified notes, stays available, and prevents replay", () => {
	const h = harness();
	h.create();
	h.flush();
	assert.equal(h.responses.at(-1).ok, true);
	assert.equal(h.responses.at(-1).noteCount, 2);
	const creations = () => h.calls.filter((c) => c[1] === "create_clip").length;
	h.create();
	assert.equal(creations(), 1);
	h.select(11, 22);
	h.create("create-two");
	h.flush();
	assert.equal(creations(), 2);
	assert.equal(h.responses.at(-1).destination, "Two · empty slot 1");
	assert.equal(h.calls.filter((c) => /undo_step/.test(c[1])).length, 0);
});
test("selection changes while writing do not redirect the write", () => {
	const h = harness();
	h.create();
	h.select(11, 22);
	h.flush();
	assert.equal(h.objects.get(22).has_clip[0], 0);
	assert.equal(h.responses.at(-1).destination, "One · empty slot 1");
});
test("clip replaced before acknowledgement is never written again", () => {
	const h = harness();
	h.create();
	h.objects.get(20).clip = ["id", 999];
	h.flush();
	assert.equal(h.responses.at(-1).ok, false);
	assert.equal(h.calls.filter((c) => c[1] === "add_new_notes").length, 1);
});
test("read-back mismatch reports the exact field without silently accepting it", () => {
	const h = harness();
	h.create();
	const created = h.objects.get(h.objects.get(20).clip[1]);
	created.notes[0].duration += 0.01;
	h.flush();
	assert.equal(h.responses.at(-1).ok, false);
	assert.match(h.responses.at(-1).error, /duration differs by 0.010000/);
	assert.equal(h.calls.filter((c) => c[1] === "add_new_notes").length, 1);
});
test("occupied clip is replaced in place, never redirected to an empty slot", () => {
	const h = harness(),
		original = h.input();
	original.color = [123];
	original.envelopes = { volume: [0.5] };
	const unrelated = structuredClone(h.objects.get(21));
	const target = h.target();
	assert.equal(target.destination, "One · clip 1");
	assert.equal(target.source.notes.length, 2);
	const replacement = {
		...fixture,
		title: "New melody",
		duration: 2,
		notes: [{ ...fixture.notes[0], pitch: 72, duration: 0.5 }],
	};
	h.create("next", target.target, replacement);
	h.flush();
	assert.equal(h.responses.at(-1).ok, true);
	assert.equal(h.objects.get(20).clip[1], 30);
	assert.deepEqual(
		original.notes,
		replacement.notes.map((n) => ({ ...n, mute: 0 })),
	);
	assert.equal(original.name[0], "New melody");
	assert.equal(original.length[0], 2);
	assert.deepEqual(original.color, [123]);
	assert.deepEqual(original.envelopes, { volume: [0.5] });
	assert.deepEqual(h.objects.get(21), unrelated);
	assert.equal(h.calls.filter((c) => c[1] === "create_clip").length, 0);
	assert.equal(
		h.target().source.notes[0].pitch,
		72,
		"replacement invalidates cached MIDI input",
	);
	assert.equal(h.target().connected, true);
});

test("replacement removes every old note, including muted, negative and out-of-loop notes", () => {
	const h = harness();
	const original = h.input([
		{ pitch: 0, start_time: -12, duration: 2, velocity: 44, mute: 1 },
		{ pitch: 127, start_time: 12000, duration: 1, velocity: 90, mute: 0 },
	]);
	h.create();
	h.flush();
	assert.equal(h.responses.at(-1).ok, true);
	assert.deepEqual(
		original.notes,
		fixture.notes.map((n) => ({ ...n, mute: 0 })),
	);
	assert.equal(
		h.calls.filter((c) => c[1] === "remove_notes_extended").length,
		1,
	);
});

test("empty existing clips and full tracks remain valid replacement destinations", () => {
	const h = harness(),
		original = h.input([]);
	h.objects.get(21).has_clip = [1];
	h.objects.get(21).clip = ["id", 999];
	assert.equal(h.target().connected, true);
	h.create();
	h.flush();
	assert.equal(h.responses.at(-1).ok, true);
	assert.equal(h.objects.get(20).clip[1], 30);
	assert.equal(original.notes.length, fixture.notes.length);
	assert.equal(
		h.calls.filter((c) => /create_clip|remove_notes_extended/.test(c[1]))
			.length,
		0,
	);
});

test("replacement resets offset markers for shorter, longer, negative and unlooped clips", () => {
	for (const [start, end, looping, duration] of [
		[12, 32, 1, 2],
		[-8, -4, 1, 16],
		[2, 3, 0, 8],
		[0, 32, 0, 1],
	]) {
		const h = harness(),
			original = h.input();
		original.loop_start = original.start_marker = [start];
		original.loop_end = original.end_marker = [end];
		original.looping = [looping];
		original.length = [end - start];
		h.create("resize", h.target().target, {
			...fixture,
			duration,
			notes: [fixture.notes[0]],
		});
		h.flush();
		assert.equal(h.responses.at(-1).ok, true);
		assert.deepEqual(
			[
				original.loop_start[0],
				original.start_marker[0],
				original.loop_end[0],
				original.end_marker[0],
			],
			[0, 0, duration, duration],
		);
		assert.equal(original.length[0], duration);
		assert.equal(original.looping[0], looping);
	}
});

test("stale occupied targets, recording clips and audio clips cannot be replaced", () => {
	const mutations = (h) =>
		h.calls.filter((c) =>
			/^(set|create_clip|remove_notes_extended|add_new_notes)$/.test(c[1]),
		);
	for (const property of ["is_recording", "is_overdubbing", "is_midi_clip"]) {
		const h = harness(),
			original = h.input(),
			old = h.target().target;
		original[property] = [property === "is_midi_clip" ? 0 : 1];
		h.create("unsafe", old);
		h.flush();
		assert.equal(h.responses.at(-1).ok, false);
		assert.equal(mutations(h).length, 0);
	}
	for (const newId of [0, 31]) {
		const h = harness(),
			original = h.input(),
			old = h.target().target;
		const before = structuredClone(original);
		h.objects.set(31, clipObject(4, fixture.notes));
		h.objects.get(20).clip = ["id", newId];
		h.objects.get(20).has_clip = [newId ? 1 : 0];
		h.create("stale", old);
		h.flush();
		assert.match(h.responses.at(-1).error, /selection changed/);
		assert.deepEqual(original, before);
		assert.equal(mutations(h).length, 0);
	}
});

test("a formerly empty slot becoming occupied is rejected rather than silently overwritten", () => {
	const h = harness(),
		old = h.target().target;
	const original = h.input(),
		before = structuredClone(original);
	h.create("stale-empty", old);
	h.flush();
	assert.match(h.responses.at(-1).error, /selection changed/);
	assert.deepEqual(original, before);
	assert.equal(
		h.calls.filter((c) => c[1] === "remove_notes_extended").length,
		0,
	);
});

test("replacement replay and later selection changes never clear or fill a second time", () => {
	const h = harness();
	h.input();
	h.create();
	h.select(11, 22);
	h.flush();
	assert.equal(h.responses.at(-1).ok, true);
	h.create();
	h.flush();
	assert.equal(
		h.calls.filter((c) => c[1] === "remove_notes_extended").length,
		1,
	);
	assert.equal(h.calls.filter((c) => c[1] === "add_new_notes").length, 1);
	assert.equal(h.objects.get(22).has_clip[0], 0);
});

test("unreadable original notes/markers and invalid generated notes fail before replacement", () => {
	for (const setup of [
		(c) => {
			c.notes = null;
		},
		(c) => {
			c.notes[0].start_time = "bad";
		},
		(c) => {
			c.loop_start = undefined;
		},
	]) {
		const h = harness(),
			original = h.input();
		setup(original);
		const before = structuredClone(original);
		h.create();
		h.flush();
		assert.equal(h.responses.at(-1).ok, false);
		assert.deepEqual(original, before);
		assert.equal(
			h.calls.filter((c) =>
				/^(set|remove_notes_extended|add_new_notes)$/.test(c[1]),
			).length,
			0,
		);
	}
	const h = harness(),
		original = h.input(),
		before = structuredClone(original);
	h.create("invalid-result", h.target().target, {
		...fixture,
		notes: [{ ...fixture.notes[0], velocity: -1 }],
	});
	assert.equal(h.responses.at(-1).ok, false);
	assert.deepEqual(original, before);
});

test("failed or ignored removal does not add notes; partial write failures never auto-retry", () => {
	for (const failure of ["throw", "ignore"]) {
		const h = harness(),
			original = h.input(),
			before = structuredClone(original);
		h.faults.remove = failure;
		h.create();
		h.flush();
		assert.equal(h.responses.at(-1).ok, false);
		assert.deepEqual(original, before);
		assert.equal(h.calls.filter((c) => c[1] === "add_new_notes").length, 0);
	}
	const h = harness();
	h.input();
	h.faults.add = true;
	h.create();
	h.flush();
	h.create();
	assert.equal(h.responses.at(-1).ok, false);
	assert.match(h.responses.at(-1).error, /Undo/);
	assert.equal(
		h.calls.filter((c) => c[1] === "remove_notes_extended").length,
		1,
	);
	assert.equal(h.calls.filter((c) => c[1] === "add_new_notes").length, 1);
});

test("replacement verification detects leftover notes outside the new loop without retrying writes", () => {
	const h = harness(),
		original = h.input();
	h.create();
	original.notes.push({
		pitch: 127,
		start_time: 12000,
		duration: 1,
		velocity: 96,
	});
	h.flush();
	assert.equal(h.responses.at(-1).ok, false);
	assert.match(h.responses.at(-1).error, /Expected 2 notes; Live returned 3/);
	assert.equal(h.calls.filter((c) => c[1] === "add_new_notes").length, 1);
});

test("Session input clears on an empty slot even when detail_clip still contains the old MIDI", () => {
	const h = harness();
	h.input();
	assert.equal(h.target().sourceId, "30");
	h.select(10, 21);
	h.objects.get(1).detail_clip = ["id", 30];
	assert.equal(h.target().source, null);
	assert.equal(h.target().sourceId, "");
	h.select(10, 20);
	assert.equal(h.target().sourceId, "30");
	h.select(12, 20);
	h.objects.get(1).detail_clip = ["id", 30];
	assert.equal(h.target().source, null);
	h.select(11, 20);
	assert.equal(
		h.target().source,
		null,
		"a stale slot on another track is not input",
	);
	h.select(10, 0);
	assert.equal(h.target().source, null);
});

test("Session input changes with the highlighted clip, without reusing stale detail MIDI", () => {
	const h = harness();
	h.input();
	h.objects.set(31, {
		name: ["Chords"],
		is_midi_clip: [1],
		length: [8],
		notes: [{ ...fixture.notes[0], pitch: 72 }],
	});
	h.objects.get(22).has_clip = [1];
	h.objects.get(22).clip = ["id", 31];
	h.select(11, 22);
	h.objects.get(1).detail_clip = ["id", 30];
	assert.equal(h.target().sourceId, "31");
	assert.equal(h.target().source.notes[0].pitch, 72);
	assert.equal(h.target().connected, true, "a full track supports replacement");
});

test("Arrangement input follows detail_clip, but cannot replace a hidden Session destination", () => {
	const h = harness();
	h.input();
	h.objects.get(3).focused_document_view = ["Arranger"];
	h.select(11, 22);
	h.objects.get(1).detail_clip = ["id", 30];
	const target = h.target();
	assert.equal(target.connected, false);
	assert.match(target.error, /Session View/);
	h.create("arrangement", "old-session-target");
	assert.match(h.responses.at(-1).error, /Session View/);
	assert.equal(target.sourceId, "30");
	assert.deepEqual(target.source.notes, fixture.notes);
	h.select(12, 0);
	h.objects.get(1).detail_clip = ["id", 30];
	assert.equal(h.target().connected, false);
	assert.deepEqual(h.target().source.notes, fixture.notes);
	assert.ok(h.calls.every((call) => call[1] === "get_all_notes_extended"));
});

test("clip color follows in-place changes without rereading MIDI notes", () => {
	const h = harness(),
		clip = h.input();
	clip.color = [0xff33d8];
	assert.equal(h.target().source.color, 0xff33d8);
	const reads = h.calls.length;
	clip.color = [0x123456];
	assert.equal(h.target().source.color, 0x123456);
	assert.equal(h.calls.length, reads);
	clip.color = [-1];
	assert.equal(h.target().source.color, undefined);
	h.select(10, 21);
	assert.equal(h.target().source, null);
});

test("fresh input rereads in-place edits, and clearing or selecting audio removes old input", () => {
	const h = harness(),
		clip = h.input();
	assert.equal(h.target().source.notes[0].pitch, 60);
	clip.notes[0].pitch = 42;
	clip.name = ["Edited in Live"];
	assert.equal(h.target(true).source.notes[0].pitch, 42);
	assert.equal(h.target().source.title, "Edited in Live");
	h.objects.get(1).detail_clip = ["id", 0];
	h.select(10, 21);
	assert.equal(h.target().source, null);
	clip.is_midi_clip = [0];
	h.select(10, 20);
	assert.equal(h.target().source, null);
	assert.ok(h.calls.every((call) => call[1] === "get_all_notes_extended"));
});

test("Live input preserves sanitizer limits, mute handling and fractional velocity", async () => {
	const notes = Array.from({ length: CONFIG.maxInputNotes + 2 }, (_, i) => ({
		pitch: i % 128,
		start_time: i / 2,
		duration: 0.25,
		velocity: 81.5,
		mute: i === 0 ? 1 : 0,
	}));
	notes[1].start_time = 1500;
	const h = harness(),
		clip = h.input(notes);
	clip.length = [2048];
	h.objects.get(21).has_clip = [1];
	const before = structuredClone(clip);
	const context = h.target(true);
	assert.equal(context.connected, true);
	assert.equal(context.source.notes.length, notes.length);
	const promptText = "Rework this MIDI";
	const expected = buildRequest({
		promptText,
		title: fixture.title,
		duration: 2048,
		notes,
	});
	let actual;
	const session = createChatSession({
		initial: normalizeChat(null),
		save: () => true,
		readContext: async () => h.target(true),
		createGenerator: () => ({
			generate: async (input) => {
				actual = buildRequest(input);
				return { ...fixture, explanation: "Test", key: null, history: [] };
			},
		}),
	});
	session.setDraft(promptText);
	await session.generate();
	assert.deepEqual(actual, expected);
	assert.ok(actual.sourceClip.notes.some((note) => note.start_time === 1500));
	assert.equal(actual.sourceClip.notes.length, CONFIG.maxInputNotes - 1);
	assert.equal(actual.sourceClip.notes[0].velocity, 81.5);
	assert.deepEqual(clip, before);
	assert.ok(h.calls.every((call) => call[1] === "get_all_notes_extended"));
});

test("unreadable selected MIDI fails generation instead of silently using another source", async () => {
	const h = harness(),
		clip = h.input();
	h.target();
	clip.notes = null;
	const context = h.target(true);
	assert.equal(
		context.connected,
		true,
		"output availability is independent of input errors",
	);
	assert.equal(context.source, null);
	assert.match(context.sourceError, /Could not read the selected MIDI clip/);
	let calls = 0;
	const session = createChatSession({
		initial: normalizeChat(null),
		save: () => true,
		readContext: async () => h.target(true),
		createGenerator: () => {
			calls++;
			throw new Error("Must not run");
		},
	});
	session.setDraft("Refine the selected clip");
	await session.generate();
	assert.equal(calls, 0);
	assert.match(session.getSnapshot().turns[0].error, /Could not read/);
	h.context.notifydeleted();
	session.setDraft("Try after the connector stopped");
	await session.generate();
	assert.equal(calls, 0);
	assert.match(
		session.getSnapshot().turns[1].error,
		/Could not read Live's MIDI input/,
	);
});
test("in-flight duplicate requests and concurrent writes cannot create twice", () => {
	const h = harness();
	h.create();
	h.create();
	h.create("another");
	h.flush();
	assert.equal(h.calls.filter((c) => c[1] === "create_clip").length, 1);
	assert.equal(h.responses.at(-1).ok, true);
});
test("Max list messages dispatch only explicitly supported bridge actions", () => {
	const h = harness();
	h.context.list("context", "read-one", 0);
	assert.equal(h.responses.at(-1).ok, true);
	h.context.list("eval", "bad", "delete everything");
	assert.equal(h.calls.length, 0);
});
test("jweb transport sends only musical data and waits for acknowledgement", async () => {
	let receive, sent;
	const host = {
		max: {
			bindInlet: (_, callback) => {
				receive = callback;
			},
			outlet: (...args) => {
				sent = args;
			},
		},
	};
	const pending = createClip(
		host,
		{ ...fixture, history: ["private prompt"], apiKey: "not-sent" },
		"target",
	);
	assert.equal(sent[0], "create");
	assert.doesNotMatch(sent[2], /history|apiKey|close_and_send/);
	receive(sent[1], JSON.stringify({ ok: true, noteCount: 2 }));
	assert.equal((await pending).noteCount, 2);
	const next = currentContext(host);
	receive(sent[1], JSON.stringify({ ok: true, context: { connected: true } }));
	assert.equal((await next).connected, true);
});

test("large MIDI crosses the symbol-limited bridge intact in both directions", async () => {
	const receivers = new Map(),
		wire = [];
	const h = harness((outlet, action, ...args) => {
		if (outlet !== 0) return;
		wire.push([action, ...args]);
		for (const arg of args)
			if (typeof arg === "string") assert.ok(Buffer.byteLength(arg) < 32767);
		receivers.get(action)?.(...args);
	});
	const host = {
		max: {
			bindInlet: (name, receive) => receivers.set(name, receive),
			outlet: (...args) => {
				wire.push(args);
				for (const arg of args)
					if (typeof arg === "string")
						assert.ok(Buffer.byteLength(arg) < 32767);
				h.context.list(...args);
			},
		},
	};
	const notes = Array.from({ length: 2048 }, (_, i) => ({
		pitch: 48 + (i % 24),
		start_time: i / 8,
		duration: 0.1,
		velocity: 80 + (i % 20),
	}));
	h.input(notes);
	const selected = await currentContext(host, true);
	assert.ok(JSON.stringify(selected).length > 32767);
	assert.deepEqual(
		selected.source.notes.map(({ mute, ...note }) => note),
		notes,
	);
	const clip = { title: "Fire Castle 🎹 test", duration: 256, notes };
	const write = createClip(host, clip, selected.target);
	h.flush();
	assert.equal((await write).noteCount, 2048);
	assert.deepEqual(
		h.objects.get(30).notes.map(({ mute, ...note }) => note),
		notes,
	);
	assert.equal(h.calls.filter((c) => c[1] === "add_new_notes").length, 1);
	assert.ok(wire.some((c) => c[0] === "responsepart"));
	assert.ok(wire.some((c) => c[0] === "createpart"));
	const reread = await currentContext(host, true);
	assert.deepEqual(
		reread.source.notes.map(({ mute, ...note }) => note),
		notes,
	);
	assert.equal(reread.source.title, clip.title);
	h.select(10, 21);
	const empty = await currentContext(host, true);
	const createNew = createClip(host, clip, empty.target);
	h.flush();
	assert.equal((await createNew).noteCount, 2048);
	assert.equal(h.calls.filter((c) => c[1] === "create_clip").length, 1);
	const created = h.objects.get(h.objects.get(21).clip[1]);
	assert.deepEqual(
		created.notes.map(({ mute, ...note }) => note),
		notes,
	);
});

test("incomplete or out-of-order large writes never mutate a clip", () => {
	const h = harness();
	h.context.createpart("partial", 0, 2, '{"clip":');
	assert.equal(h.calls.length, 0);
	h.context.createpart("partial", 2, 2, "}");
	assert.match(h.responses.at(-1).error, /incomplete/);
	assert.equal(h.calls.length, 0);
	h.context.createpart("abandoned", 0, 2, '{"clip":');
	h.flush();
	assert.equal(h.context.incoming, null);
	assert.equal(h.calls.length, 0);
});
