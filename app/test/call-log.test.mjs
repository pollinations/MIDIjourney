import assert from "node:assert/strict";
import test from "node:test";
import { PollinationsError } from "@pollinations/sdk";
import { PollinationsMidiClient } from "../.generated/midi-core.mjs";
import {
	MAX_CALLS,
	observeChat,
	reportedUsage,
	upsertCall,
} from "../src/call-log.mjs";

const clip = {
	title: "Test",
	explanation: "A phrase",
	key: "C major",
	duration: 8,
	notes: [{ pitch: 60, start_time: 0, duration: 1, velocity: 90 }],
};
const response = {
	model: "reported-model",
	choices: [
		{ finish_reason: "stop", message: { content: JSON.stringify(clip) } },
	],
	usage: {
		prompt_tokens: 123,
		completion_tokens: 45,
		total_tokens: 168,
		prompt_tokens_details: { cached_tokens: 0 },
		completion_tokens_details: { reasoning_tokens: 12 },
	},
};

function logger(client) {
	let rows = [],
		id = 0;
	return {
		observed: observeChat(
			client,
			(entry) => {
				rows = upsertCall(rows, entry);
			},
			() => ++id,
		),
		rows: () => rows,
	};
}

test("log reports provider model, token counts and validated output without recording requests", async () => {
	const log = logger({
		chat: async () => ({ ...response, apiKey: "not-for-logs" }),
	});
	const result = await log.observed.chat([{ content: "private prompt" }], {
		model: "requested-alias",
		apiKey: "not-for-logs",
	});
	assert.equal(result.apiKey, "not-for-logs"); // Observer does not change response.
	const row = log.rows()[0];
	assert.equal(row.model, "reported-model");
	assert.equal(row.requestedModel, "requested-alias");
	assert.deepEqual(row.usage, {
		input: 123,
		output: 45,
		total: 168,
		cached: 0,
		reasoning: 12,
	});
	assert.equal(row.finishReason, "stop");
	assert.equal(row.output.noteCount, 1);
	assert.equal(row.output.validation, "Valid MIDI");
	assert.doesNotMatch(
		JSON.stringify(log.rows()),
		/not-for-logs|private prompt|apiKey/,
	);
});

test("unknown usage/model remain unknown and plain text is classified as a chat reply", async () => {
	assert.deepEqual(
		reportedUsage({
			prompt_tokens: 0,
			total_tokens: -1,
			completion_tokens: "12",
		}),
		{ input: 0, output: null, total: null, cached: null, reasoning: null },
	);
	const log = logger({
		chat: async () => ({
			choices: [{ message: { content: "private malformed text" } }],
		}),
	});
	await log.observed.chat([], { model: "not-the-actual-model" });
	assert.equal(log.rows()[0].model, null);
	assert.equal(log.rows()[0].usage.total, null);
	assert.equal(log.rows()[0].output.validation, "Chat reply — no MIDI");
	assert.deepEqual(log.rows()[0].reply, {
		text: "private malformed text",
		status: "original",
	});
	assert.equal(log.rows()[0].output.noteCount, undefined);
});

test("only explicit retries add another log entry and original SDK errors retain their identity", async () => {
	let attempt = 0;
	const failure = new PollinationsError(
		"Private response body",
		"UNAVAILABLE",
		503,
	);
	const log = logger({
		chat: async () => {
			if (!attempt++) throw failure;
			return response;
		},
	});
	const midi = new PollinationsMidiClient({
		auth: { requireClient: () => log.observed },
	});
	await assert.rejects(midi.generate({ promptText: "A test", duration: 8 }), {
		code: "PROVIDER_UNAVAILABLE",
	});
	assert.equal(attempt, 1);
	assert.equal(log.rows().length, 1);
	// A second user action may retry; the app never does it automatically.
	await midi.generate({ promptText: "A test", duration: 8 });
	assert.deepEqual(
		log.rows().map((row) => row.status),
		["Failed", "Received"],
	);
	assert.equal(log.rows()[0].error.httpStatus, 503);
	assert.doesNotMatch(JSON.stringify(log.rows()), /Private response body/);
	const failed = logger({
		chat: async () => {
			throw failure;
		},
	});
	await assert.rejects(
		failed.observed.chat([], {}),
		(error) => error === failure,
	);
});

test("cancel is recorded immediately and late responses do not replace it", async () => {
	let resolve;
	const signal = new AbortController();
	const log = logger({
		chat: () =>
			new Promise((done) => {
				resolve = done;
			}),
	});
	const pending = log.observed.chat([], { signal: signal.signal });
	assert.equal(log.rows()[0].status, "Pending");
	signal.abort();
	assert.equal(log.rows()[0].status, "Canceled");
	resolve(response);
	await pending;
	assert.equal(log.rows()[0].status, "Canceled");
	assert.equal(log.rows()[0].model, null);
});

test("retention and note previews are bounded; observer failures cannot break requests", async () => {
	const large = {
		...clip,
		notes: Array.from({ length: 180 }, () => clip.notes[0]),
	};
	const log = logger({
		chat: async () => ({
			choices: [{ message: { content: JSON.stringify(large) } }],
		}),
	});
	for (let index = 0; index < MAX_CALLS + 2; index++)
		await log.observed.chat([], {});
	assert.equal(log.rows().length, MAX_CALLS);
	assert.equal(log.rows()[0].id, 3);
	assert.equal(log.rows()[0].output.notes.length, 128);
	assert.equal(log.rows()[0].output.omittedNotes, 52);
	const observed = observeChat(
		{ chat: async () => response },
		() => {
			throw new Error("Observer");
		},
		() => 1,
	);
	assert.equal(await observed.chat([], {}), response);
});
