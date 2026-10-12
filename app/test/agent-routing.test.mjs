import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { Pollinations } from "@pollinations/sdk";
import { PollinationsMidiClient } from "../.generated/midi-core.mjs";
import { observeChat } from "../src/call-log.mjs";
import { createChatSession } from "../src/chat-session.mjs";
import { pianoRoll } from "../src/piano-roll.mjs";
import { normalizeChat } from "../src/session.mjs";

const require = createRequire(import.meta.url);
const agentFixtures = require("../../core/test/fixtures/agent-responses.json");
const managedReplies = require("../../core/test/fixtures/managed-agent-replies.json");
const AGENT = "community/pollinations-ai/midijourney";
const clip = {
	title: "Agent phrase",
	explanation: "A short musical variation.",
	key: "C major",
	duration: 8,
	notes: [{ pitch: 60, start_time: 0, duration: 1, velocity: 90 }],
};
const response = {
	model: "openai/gpt-6-astra",
	choices: [
		{ message: { content: JSON.stringify(clip) }, finish_reason: "stop" },
	],
	usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
};

test("exact transposition uses fresh selection without SDK calls and still requires Create", async () => {
	let live = {
		connected: true,
		target: "10:20:30:20",
		sourceId: "30",
		source: structuredClone(clip),
	};
	const writes = [];
	const session = createChatSession({
		initial: normalizeChat(null),
		readContext: async () => live,
		writeClip: async (result, target) => {
			writes.push({ result, target });
			return { noteCount: result.notes.length };
		},
		createGenerator: () =>
			new PollinationsMidiClient({
				auth: {
					requireClient: () => assert.fail("Exact edit must not use the SDK"),
				},
			}),
	});
	session.setDraft("Transpose up an octave");
	await session.generate();
	let turn = session.getSnapshot().turns.at(-1);
	assert.equal(turn.status, "complete");
	assert.equal(turn.result.notes[0].pitch, 72);
	assert.equal(turn.result.key, "C major");
	assert.deepEqual(turn.calls, []);
	assert.equal(writes.length, 0);
	await session.send(turn.id, live);
	assert.equal(writes.length, 1);
	assert.equal(writes[0].result.notes[0].pitch, 72);
	live = {
		...live,
		source: { ...clip, notes: [{ ...clip.notes[0], mute: 1 }, clip.notes[0]] },
	};
	session.setDraft("Transpose up an octave");
	await session.generate();
	turn = session.getSnapshot().turns.at(-1);
	assert.equal(turn.result, undefined);
	assert.match(turn.text, /cannot preserve/);
	assert.equal(writes.length, 1);
	session.dispose();
});

test("the real chat session and SDK send the agent ID, fresh MIDI, and output contract", async (t) => {
	const requests = [];
	t.mock.method(globalThis, "fetch", async (url, init) => {
		assert.equal(new URL(url).pathname, "/v1/chat/completions");
		const body = JSON.parse(init.body);
		assert.equal(
			body.messages.some((m) => m.role === "system"),
			false,
		);
		requests.push(body);
		if (body.model !== AGENT) {
			return Response.json(
				{
					error: {
						code: "BAD_REQUEST",
						message: `Invalid model or alias: "${body.model}". Must be a valid model name or alias.`,
					},
				},
				{ status: 400 },
			);
		}
		// Reproduce the managed agent's actual rejection, not a permissive mock.
		if (Object.hasOwn(body, "response_format")) {
			return Response.json(
				{
					error: {
						code: "BAD_REQUEST",
						message:
							"Structured text output is not supported by managed agents",
					},
				},
				{ status: 400 },
			);
		}
		return Response.json(response);
	});
	const client = new Pollinations({ apiKey: "test-only-not-a-credential" });
	let callId = 0;
	const session = createChatSession({
		initial: normalizeChat(null),
		save: () => true,
		readContext: async () => ({
			connected: true,
			target: "10:20:30:20",
			sourceId: "30",
			source: clip,
		}),
		writeClip: async () => assert.fail("Generation must not write to Live"),
		createGenerator: (onEntry) =>
			new PollinationsMidiClient({
				auth: {
					requireClient: () => observeChat(client, onEntry, () => ++callId),
				},
			}),
	});
	t.after(() => session.dispose());
	session.setDraft("Use GPT Astra model please");
	await session.generate();
	assert.equal(requests.length, 1);
	const body = requests[0];
	assert.equal(body.model, AGENT);
	assert.equal(body.stream, false);
	assert.equal(session.getSnapshot().turns.at(-1).status, "complete");
	assert.equal(Object.hasOwn(body, "response_format"), false);
	const input = JSON.parse(body.messages.at(-1).content);
	assert.equal(input.instruction, "Use GPT Astra model please");
	assert.deepEqual(input.sourceClip.notes, clip.notes);
	const turn = session.getSnapshot().turns.at(-1);
	assert.equal(turn.status, "complete");
	assert.equal(turn.calls[0].requestedModel, AGENT);
	assert.equal(turn.calls[0].model, response.model);
	assert.equal(turn.calls[0].usage.total, 150);
});

test("a failed SDK agent call is not retried or replaced by a direct model", async (t) => {
	const models = [];
	t.mock.method(globalThis, "fetch", async (_url, init) => {
		const body = JSON.parse(init.body);
		assert.equal(
			body.messages.some((m) => m.role === "system"),
			false,
		);
		assert.equal(Object.hasOwn(body, "response_format"), false);
		models.push(body.model);
		return models.length === 1
			? Response.json(
					{ error: { message: "Temporarily unavailable" } },
					{ status: 503 },
				)
			: Response.json(response);
	});
	const client = new Pollinations({ apiKey: "test-only-not-a-credential" });
	const generator = new PollinationsMidiClient({
		auth: { requireClient: () => client },
	});
	await assert.rejects(
		generator.generate({
			promptText: "A short phrase",
			model: "openai",
		}),
		{ code: "PROVIDER_UNAVAILABLE" },
	);
	assert.deepEqual(models, [AGENT]);
});

test("native agent YAML/CSV works through the SDK, chat, preview and diagnostics", async (t) => {
	let requests = 0;
	let saved = null;
	const replies = [
		agentFixtures.native,
		agentFixtures.nativeDespiteJsonRequest,
		agentFixtures.updatedApp,
	];
	t.mock.method(globalThis, "fetch", async (_url, init) => {
		const body = JSON.parse(init.body);
		assert.equal(
			body.messages.some((m) => m.role === "system"),
			false,
		);
		assert.equal(body.model, AGENT);
		assert.equal(Object.hasOwn(body, "response_format"), false);
		if (requests > 0) {
			// A native reply becomes validated context for the next request.
			const previous = body.messages.find(
				(message) => message.role === "assistant",
			);
			assert.equal(JSON.parse(previous.content).notes.length, 8);
		}
		return Response.json({
			...response,
			choices: [
				{ message: { content: replies[requests++] }, finish_reason: "stop" },
			],
		});
	});
	const client = new Pollinations({ apiKey: "test-only-not-a-credential" });
	let callId = 0;
	const session = createChatSession({
		initial: normalizeChat(null),
		save: (state) => {
			saved = state;
			return true;
		},
		readContext: async () => ({ connected: true, target: "10:20:30:20" }),
		writeClip: async () => assert.fail("Generation must not write to Live"),
		createGenerator: (onEntry) =>
			new PollinationsMidiClient({
				auth: {
					requireClient: () => observeChat(client, onEntry, () => ++callId),
				},
			}),
	});
	t.after(() => session.dispose());
	for (const [index, original] of replies.entries()) {
		session.setDraft(index === 0 ? "A gentle melody" : "Make a variation");
		await session.generate();
		const turn = session.getSnapshot().turns.at(-1);
		assert.equal(turn.status, "complete");
		assert.equal(turn.result.notes.length, 8);
		assert.equal(turn.result.duration, 8);
		const roll = pianoRoll(turn.result.notes, turn.result.duration);
		assert.equal(roll.notes.length, 8);
		assert.ok(
			roll.notes.every(
				(note) =>
					Number.isFinite(note.x) && Number.isFinite(note.y) && note.width > 0,
			),
		);
		if (original === agentFixtures.updatedApp) {
			assert.match(turn.result.explanation, /A rising piano phrase/);
		}
		assert.equal(turn.calls[0].output.validation, "Valid MIDI");
		assert.equal(turn.calls[0].output.noteCount, 8);
		assert.equal(turn.calls[0].model, response.model);
		assert.equal(turn.calls[0].reply.text, original);
		assert.equal(turn.calls[0].usage.total, 150);
		const restored = normalizeChat(saved).turns.at(-1);
		assert.deepEqual(restored.result.notes, turn.result.notes);
		assert.equal(restored.calls[0].reply.text, original);
	}
	assert.equal(requests, replies.length);
});

test("chat replies do not require MIDI; invalid MIDI is withheld without model fallback", async (t) => {
	let requests = 0;
	for (const content of [
		"Here is a nice melody",
		agentFixtures.native.replace("60,0,1,60", "60,0,1,seventy"),
		JSON.stringify({
			...clip,
			notes: [{ pitch: 128, start_time: 0, duration: 1, velocity: 90 }],
		}),
	]) {
		t.mock.method(globalThis, "fetch", async (_url, init) => {
			const body = JSON.parse(init.body);
			assert.equal(
				body.messages.some((m) => m.role === "system"),
				false,
			);
			assert.equal(body.model, AGENT);
			assert.equal(Object.hasOwn(body, "response_format"), false);
			requests += 1;
			return Response.json({
				...response,
				choices: [{ message: { content }, finish_reason: "stop" }],
			});
		});
		const client = new Pollinations({ apiKey: "test-only-not-a-credential" });
		const generator = new PollinationsMidiClient({
			auth: { requireClient: () => client },
		});
		const result = await generator.generate({ promptText: "A short phrase" });
		assert.equal(result.notes, undefined);
		if (content === "Here is a nice melody") {
			assert.equal(result.text, content);
			assert.equal(result.midiWarning, "");
		} else assert.match(result.midiWarning, /MIDI could not be used/);
		t.mock.restoreAll();
	}
	assert.equal(requests, 3);
});

test("captured managed-agent replies survive SDK, chat state, follow-ups and guarded writes", async (t) => {
	const contents = [
		"**Syncopation** accents offbeats.",
		managedReplies["current-claude"].content,
		managedReplies["agent-image"].content,
		managedReplies["agent-claude"].content,
		"Keep this explanation.\n```json\n" +
			JSON.stringify({
				...clip,
				notes: [{ pitch: 200, start_time: 0, duration: 1, velocity: 80 }],
			}) +
			"\n```",
	];
	let index = 0,
		writes = 0,
		callId = 0;
	const requests = [];
	t.mock.method(globalThis, "fetch", async (_url, init) => {
		requests.push(JSON.parse(init.body));
		return Response.json({
			...response,
			id: `response-${index}`,
			choices: [
				{ message: { content: contents[index++] }, finish_reason: "stop" },
			],
		});
	});
	const client = new Pollinations({ apiKey: "test-only-not-a-credential" });
	const live = { connected: true, target: "10:20:30:20", source: clip };
	const session = createChatSession({
		initial: normalizeChat(null),
		readContext: async () => live,
		writeClip: async (result) => {
			writes++;
			assert.equal(result.notes.length, 16);
			return { noteCount: 16, destination: "test" };
		},
		createGenerator: (onEntry) =>
			new PollinationsMidiClient({
				auth: {
					requireClient: () => observeChat(client, onEntry, () => ++callId),
				},
			}),
	});
	t.after(() => session.dispose());
	for (let i = 0; i < contents.length; i++) {
		session.setDraft(`Request ${i}`);
		await session.generate();
		const turn = session.getSnapshot().turns.at(-1);
		assert.equal(turn.status, "complete");
		assert.equal(Boolean(turn.result), i === 1);
		assert.equal(turn.calls[0].responseId, `response-${i}`);
		assert.doesNotMatch(turn.text, /<details|model catalog omitted/);
		if (i === 4) assert.match(turn.midiWarning, /MIDI could not be used/);
		const normalized = normalizeChat(session.getSnapshot()).turns.at(-1);
		assert.equal(normalized.text, turn.text);
		assert.equal(normalized.status, "complete");
		await session.send(turn.id, live);
	}
	assert.equal(
		writes,
		1,
		"only the valid Claude MIDI can be written, never the selected source",
	);
	assert.ok(
		requests.every((r) => r.model === AGENT && !("response_format" in r)),
	);
	assert.doesNotMatch(
		JSON.stringify(requests),
		/<details|model catalog omitted/,
	);
	assert.match(
		requests[1].messages.find((m) => m.role === "assistant").content,
		/Syncopation/,
	);
});
