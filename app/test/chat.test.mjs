import assert from "node:assert/strict";
import test from "node:test";
import { createChatSession } from "../src/chat-session.mjs";
import { freshChat, normalizeChat } from "../src/session.mjs";

const result = {
	title: "A small phrase",
	explanation: "Gentle notes.\n\nModel: fixture",
	key: "C major",
	duration: 8,
	notes: [{ pitch: 60, velocity: 90, start_time: 0, duration: 1 }],
};
const history = [
	{ role: "user", content: "first prompt", contextContent: "first prompt" },
	{
		role: "assistant",
		content: "first result",
		contextContent: JSON.stringify(result),
	},
];
const deferred = () => {
	let resolve, reject;
	const promise = new Promise((a, b) => {
		resolve = a;
		reject = b;
	});
	return { promise, resolve, reject };
};
function harness() {
	const jobs = [],
		writes = [],
		snapshots = [];
	let live = { connected: true, target: "10:20:0:20", destination: "MIDI 1" };
	const session = createChatSession({
		initial: normalizeChat(null),
		save: (state) => {
			snapshots.push(state);
			return true;
		},
		readContext: async () => live,
		createGenerator: (onCall) => {
			const job = { ...deferred(), onCall, canceled: false };
			jobs.push(job);
			return {
				generate(input) {
					job.input = input;
					return job.promise;
				},
				cancel() {
					job.canceled = true;
				},
			};
		},
		writeClip: async (clip, target) => {
			writes.push({ clip, target });
			return { noteCount: clip.notes.length, destination: target };
		},
	});
	return {
		session,
		jobs,
		writes,
		snapshots,
		setLive: (value) => {
			live = value;
		},
		async start(prompt = "First idea") {
			session.setDraft(prompt);
			const promise = session.generate();
			await Promise.resolve();
			return { promise, job: jobs.at(-1) };
		},
		async finish(prompt) {
			const { promise, job } = await this.start(prompt);
			job.resolve({ ...result, history });
			await promise;
			return session.getSnapshot().turns.at(-1);
		},
	};
}
test("new chat removes both visible replies and model context, not Live clips", async () => {
	const h = harness();
	await h.finish();
	h.session.setDraft("unsent");
	assert.equal(h.session.newChat(), true);
	assert.deepEqual(h.session.getSnapshot().turns, []);
	assert.deepEqual(h.session.getSnapshot().context, []);
	assert.equal(h.session.getSnapshot().draft, "");
	assert.equal(h.writes.length, 0);
	const { promise, job } = await h.start("Fresh start");
	assert.deepEqual(job.input.history, []);
	job.resolve({ ...result, history });
	await promise;
});
test("opening and resetting a conversation never generate a welcome API call", () => {
	const h = harness();
	assert.equal(h.jobs.length, 0);
	assert.deepEqual(h.session.getSnapshot().context, []);
	h.session.newChat();
	assert.equal(h.jobs.length, 0);
	assert.equal(h.writes.length, 0);
});
test("follow-ups keep conversation context and every MIDI reply remains sendable", async () => {
	const h = harness(),
		first = await h.finish();
	const { promise, job } = await h.start("Simpler left hand");
	assert.deepEqual(job.input.history, history);
	assert.deepEqual(
		job.input.notes,
		[],
		"conversation context is not a selected MIDI attachment",
	);
	job.resolve({ ...result, title: "Simpler", history });
	await promise;
	assert.equal(h.session.getSnapshot().turns.length, 2);
	await h.session.send(first.id, {
		connected: true,
		target: "second-track-slot",
	});
	assert.equal(h.writes[0].clip.title, result.title);
	assert.equal(h.writes[0].target, "second-track-slot");
	assert.equal(h.session.getSnapshot().turns.length, 2);
});
test("new chat cancels generation; late replies and call logs cannot repopulate it", async () => {
	const h = harness(),
		{ promise, job } = await h.start();
	h.session.newChat();
	assert.equal(job.canceled, true);
	job.onCall({ id: 100, status: "Received" });
	job.resolve({ ...result, history });
	await promise;
	assert.deepEqual(h.session.getSnapshot().turns, []);
	assert.deepEqual(h.session.getSnapshot().context, []);
});
test("an old request cannot attach its diagnostics to a newer chat", async () => {
	const h = harness(),
		old = await h.start();
	h.session.newChat();
	const next = await h.start("New melody");
	old.job.onCall({ id: 1, status: "Received" });
	old.job.resolve({ ...result, history });
	await old.promise;
	assert.deepEqual(h.session.getSnapshot().turns[0].calls, []);
	next.job.resolve({ ...result, history: [] });
	await next.promise;
});
test("cancel preserves the exchange and drafted follow-up but not failed model context", async () => {
	const h = harness(),
		{ promise, job } = await h.start();
	h.session.setDraft("next idea");
	h.session.cancel();
	job.resolve({ ...result, history });
	await promise;
	assert.equal(h.session.getSnapshot().turns[0].status, "canceled");
	assert.equal(h.session.getSnapshot().draft, "next idea");
	assert.deepEqual(h.session.getSnapshot().context, []);
});
test("composition works without a MIDI selection; writing remains disabled", async () => {
	const h = harness();
	h.setLive({ connected: false });
	const turn = await h.finish();
	await h.session.send(turn.id, { connected: false });
	assert.equal(h.writes.length, 0);
});
test("selected MIDI always takes priority, including in-place edits and source changes", async () => {
	const h = harness(),
		source = {
			...result,
			title: "Live source",
			notes: [{ ...result.notes[0], pitch: 65 }],
		};
	h.setLive({ connected: true, target: "1:2:3:4", source });
	await h.finish();
	let pending = await h.start("Refine it");
	assert.equal(pending.job.input.notes[0].pitch, 65);
	pending.job.resolve({ ...result, history });
	await pending.promise;
	const edited = { ...source, notes: [{ ...source.notes[0], pitch: 67 }] };
	h.setLive({ connected: true, target: "1:2:3:4", source: edited });
	pending = await h.start("Use my edits in Live");
	assert.equal(pending.job.input.notes[0].pitch, 67);
	pending.job.resolve({ ...result, history });
	await pending.promise;
	h.setLive({ connected: true, target: "1:8:9:4", source });
	pending = await h.start("Use this clip");
	assert.equal(pending.job.input.notes[0].pitch, 65);
	pending.job.resolve({ ...result, history });
	await pending.promise;
});
test("an empty selected MIDI clip stays empty input rather than reusing a previous reply", async () => {
	const h = harness();
	await h.finish();
	h.setLive({
		connected: false,
		sourceId: "30",
		source: { title: "Empty input", duration: 4, notes: [] },
	});
	const { job, promise } = await h.start("Start here");
	assert.deepEqual(job.input.notes, []);
	assert.equal(job.input.title, "Empty input");
	assert.equal(job.input.duration, 4);
	job.resolve({ ...result, history });
	await promise;
});
test("errors stay with their turn and the composer can be used again", async () => {
	const h = harness(),
		{ promise, job } = await h.start();
	job.reject(new Error("Provider unavailable"));
	await promise;
	assert.equal(h.session.getSnapshot().turns[0].error, "Provider unavailable");
	assert.equal(h.session.getSnapshot().busyId, null);
	await h.finish("Try another idea");
	assert.equal(h.session.getSnapshot().turns.length, 2);
});
test("each load creates independent empty memory-only conversation state", () => {
	const first = freshChat();
	first.draft = "A melody";
	first.turns.push({ prompt: "hello" });
	first.context.push({ role: "user", content: "hello" });
	assert.deepEqual(freshChat(), { draft: "", turns: [], context: [] });
});
test("chat normalization rejects invalid MIDI, bounds explanations and strips extra fields", () => {
	const valid = normalizeChat({
		apiKey: "never-store",
		turns: [
			{
				prompt: "x",
				result: {
					...result,
					explanation: `${"a".repeat(1000)}\nModel: fixture`,
				},
				calls: [],
			},
		],
	});
	assert.equal(valid.turns[0].result.explanation.length, 1000);
	assert.equal("apiKey" in valid, false);
	const invalid = normalizeChat({
		turns: [{ prompt: "x", result: { ...result, notes: [{ pitch: -1 }] } }],
	});
	assert.equal(invalid.turns[0].result, undefined);
});
test("duplicate clip dispatch is blocked, reset waits for a dispatched write", async () => {
	const pending = deferred();
	let writes = 0;
	const session = createChatSession({
		initial: {
			...normalizeChat(null),
			turns: [{ id: "x", prompt: "x", result, calls: [] }],
		},
		createGenerator: () => {
			throw new Error("not used");
		},
		readContext: async () => ({}),
		writeClip: () => {
			writes++;
			return pending.promise;
		},
	});
	const write = session.send("x", { connected: true, target: "t" });
	await session.send("x", { connected: true, target: "t" });
	assert.equal(writes, 1);
	assert.equal(session.newChat(), false);
	pending.resolve({ noteCount: 1, destination: "MIDI" });
	await write;
	assert.equal(session.newChat(), true);
});

test("duplicate send-message events cannot start two generations", async () => {
	const h = harness();
	const pending = await h.start();
	h.session.setDraft("Keep this draft");
	await h.session.generate();
	assert.equal(h.jobs.length, 1);
	assert.equal(h.session.getSnapshot().draft, "Keep this draft");
	pending.job.resolve({ ...result, history });
	await pending.promise;
});

test("effect cleanup cancels pending work and reactivation can start a new request", async () => {
	const h = harness();
	const old = await h.start();
	h.session.dispose();
	h.session.activate();
	const next = await h.start("After remount");
	old.job.resolve({ ...result, history });
	await old.promise;
	assert.equal(h.session.getSnapshot().turns[0].status, "canceled");
	assert.equal(h.session.getSnapshot().turns[1].status, "pending");
	next.job.resolve({ ...result, history });
	await next.promise;
	assert.equal(h.session.getSnapshot().turns[1].status, "complete");
});

test("a fresh chat works without storage and never inherits another instance's draft", () => {
	const storage = {
		removeItem() {
			throw new Error("Storage unavailable");
		},
	};
	const session = createChatSession({ initial: freshChat(storage) });
	session.setDraft("Still usable");
	assert.equal(session.getSnapshot().draft, "Still usable");
	const next = createChatSession({ initial: freshChat(null) });
	assert.equal(next.getSnapshot().draft, "");
	assert.deepEqual(next.getSnapshot().turns, []);
	assert.deepEqual(next.getSnapshot().context, []);
});
