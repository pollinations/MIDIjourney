const test = require("node:test");
const assert = require("node:assert/strict");
const { PollinationsError } = require("@pollinations/sdk");
const {
	PollinationsMidiClient,
	classifyGenerationError,
} = require("../pollinationsClient.js");
const MIDI_JOURNEY_AGENT = "community/pollinations-ai/midijourney";

function createHarness(responseOverride) {
	const calls = [];
	const response = responseOverride || {
		model: "openai",
		choices: [
			{
				message: {
					content: JSON.stringify({
						title: "Broken Beat",
						explanation: "A syncopated drum pattern.",
						key: null,
						duration: 4,
						notes: [
							{ pitch: 36, start_time: 0, duration: 0.25, velocity: 110 },
							{ pitch: 38, start_time: 1.5, duration: 0.25, velocity: 96 },
						],
					}),
				},
			},
		],
		usage: { total_tokens: 100 },
	};
	const client = {
		chat: async (...args) => {
			calls.push(args);
			return response;
		},
		textModels: async () => [
			{
				name: "midijourney",
				description: "Music model",
				context_length: 32000,
			},
		],
	};
	const auth = { requireClient: () => client };
	return { auth, calls, response };
}

test("generates locally validated MIDI without managed-agent structured output and removes legacy API keys", async () => {
	const { auth, calls } = createHarness();
	const events = [];
	const generator = new PollinationsMidiClient({
		auth,
		onEvent: (event) => events.push(event),
	});
	const result = await generator.generate({
		promptText: "Create broken beat drums",
		duration: 4,
		temperature: 0.8,
		gptModel: "openai",
		history: [],
		historyStatus: true,
		apiKey: "must-not-survive",
	});

	assert.equal(result.notes.length, 2);
	assert.equal(result.apiKey, undefined);
	assert.equal(result.history.length, 2);
	assert.equal(
		calls[0][0].some((message) => message.role === "system"),
		false,
	);
	assert.equal(
		Object.hasOwn(JSON.parse(calls[0][0].at(-1).content), "midiJourneyVersion"),
		false,
	);
	assert.equal(calls[0][1].model, MIDI_JOURNEY_AGENT);
	assert.equal(Object.hasOwn(calls[0][1], "responseFormat"), false);
	assert.equal(events.at(-1).type, "generation_completed");
	assert.equal(result.explanation, "A syncopated drum pattern.");
});

test("keeps model metadata out of explanations and conversation history", async () => {
	const { auth, calls, response } = createHarness();
	response.model = "openai/gpt-6-astra";
	const generator = new PollinationsMidiClient({ auth });
	const result = await generator.generate({
		promptText: "Create MIDI",
		gptModel: "openai",
	});
	assert.equal(calls[0][1].model, MIDI_JOURNEY_AGENT);
	assert.equal(result.explanation, "A syncopated drum pattern.");
	assert.match(
		result.history[1].content,
		/explanation: >-\n {2}A syncopated drum pattern\.\nnotation:/,
	);
	assert.equal(
		JSON.parse(result.history[1].contextContent).explanation,
		"A syncopated drum pattern.",
	);

	response.model = "another-serving-model";
	const next = await generator.generate({
		promptText: "Continue",
		history: result.history,
		historyStatus: true,
	});
	assert.equal(next.explanation, "A syncopated drum pattern.");
	assert.ok(next.history.every((entry) => !entry.content.includes("Model: ")));
	assert.ok(
		calls[1][0].every((message) => !message.content.includes("Model: ")),
	);
});

test("missing, opaque or malformed response models do not affect musical explanations", async () => {
	const { auth, response } = createHarness();
	const generator = new PollinationsMidiClient({ auth });
	for (const model of [
		undefined,
		null,
		"",
		" \n ",
		"9a0db868-29cb-4e78-9d44-ba2be6551337",
		42,
		{ name: "not-a-model-string" },
	]) {
		response.model = model;
		const result = await generator.generate({
			promptText: "Create MIDI",
			gptModel: "openai",
		});
		assert.equal(result.explanation, "A syncopated drum pattern.");
		assert.doesNotMatch(result.history[1].content, /Model:/);
	}
});

test("maximum-length explanations remain intact without appended model metadata", async () => {
	const { auth, response } = createHarness();
	response.model = "  provider/model\nversion\t1  ";
	const clip = JSON.parse(response.choices[0].message.content);
	clip.explanation = "x".repeat(1000);
	response.choices[0].message.content = JSON.stringify(clip);
	const result = await new PollinationsMidiClient({ auth }).generate({
		promptText: "Create MIDI",
	});
	assert.equal(result.explanation, clip.explanation);
	assert.ok(result.history[1].content.includes(clip.explanation));
	assert.doesNotMatch(result.history[1].content, /Model:/);
	assert.equal(
		JSON.parse(result.history[1].contextContent).explanation.length,
		1000,
	);
});

test("always routes through the MIDI Journey agent despite missing or stale model selections", async () => {
	const { auth, calls } = createHarness();
	const generator = new PollinationsMidiClient({ auth });
	for (const model of [
		undefined,
		"",
		"openai",
		"midijourney",
		"pollinations/midijourney",
		"pollinations/midijourney-large",
		"gpt-4o",
		"openai/gpt-6-astra",
		MIDI_JOURNEY_AGENT,
	]) {
		for (const field of ["model", "gptModel"]) {
			await generator.generate({
				promptText: "Use GPT Astra model please",
				[field]: model,
			});
			const [messages, options] = calls.at(-1);
			assert.equal(options.model, MIDI_JOURNEY_AGENT);
			assert.equal(
				JSON.parse(messages.at(-1).content).instruction,
				"Use GPT Astra model please",
			);
		}
	}
});

test("removed dropdown modelChoice cannot bypass the MIDI Journey agent", async () => {
	const { auth, calls } = createHarness();
	const client = auth.requireClient();
	client.textModels = () => {
		assert.fail(
			"generation must not query the removed selector's model catalog",
		);
	};
	const generator = new PollinationsMidiClient({ auth });
	for (const modelChoice of [
		undefined,
		"auto",
		"openai/gpt-6-astra",
		"not-in-menu",
	]) {
		await generator.generate({
			promptText: "A melody",
			modelChoice,
			gptModel: "openai",
		});
		const [messages, options] = calls.at(-1);
		assert.equal(options.model, MIDI_JOURNEY_AGENT);
		assert.equal(Object.hasOwn(options, "responseFormat"), false);
		assert.equal(options.maxTokens, 12000);
		assert.equal(
			Object.hasOwn(JSON.parse(messages.at(-1).content), "modelChoice"),
			false,
		);
	}
});

test("rejects invalid provider MIDI before it reaches Max", async () => {
	const { auth } = createHarness({
		choices: [
			{
				message: {
					content: JSON.stringify({
						title: "Bad",
						explanation: "",
						key: null,
						duration: 4,
						notes: [{ pitch: 200, start_time: 0, duration: 1, velocity: 100 }],
					}),
				},
			},
		],
	});
	const generator = new PollinationsMidiClient({ auth });
	const result = await generator.generate({
		promptText: "Create MIDI",
		notes: [{ pitch: 60, start_time: 0, duration: 1, velocity: 80 }],
	});
	assert.equal(
		result.notes,
		undefined,
		"neither invalid output nor source MIDI may reach Max",
	);
	assert.match(result.midiWarning, /MIDI could not be used/);
});

test("an older canceled generation cannot clear the newer operation", async () => {
	const signals = [];
	const client = {
		chat: async (_messages, options) => {
			signals.push(options.signal);
			return new Promise((_resolve, reject) => {
				options.signal.addEventListener(
					"abort",
					() =>
						reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
					{ once: true },
				);
			});
		},
	};
	const generator = new PollinationsMidiClient({
		auth: { requireClient: () => client },
	});

	const first = generator.generate({ promptText: "First request" });
	const firstRejection = assert.rejects(first, { code: "CANCELED" });
	const second = generator.generate({ promptText: "Second request" });

	await firstRejection;
	generator.cancel();

	assert.equal(signals.length, 2);
	assert.equal(signals[1].aborted, true);
	await assert.rejects(second, { code: "CANCELED" });
});

test("a stale 401 arriving after cancellation cannot invalidate the current session", async () => {
	let requestCount = 0;
	let rejectFirst;
	const invalidations = [];
	const events = [];
	const client = {
		chat: async (_messages, options) => {
			requestCount += 1;
			if (requestCount === 1) {
				return new Promise((_resolve, reject) => {
					rejectFirst = reject;
				});
			}
			return new Promise((_resolve, reject) => {
				options.signal.addEventListener(
					"abort",
					() =>
						reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
					{ once: true },
				);
			});
		},
	};
	const generator = new PollinationsMidiClient({
		auth: {
			requireClient: () => client,
			invalidate: async (error) => invalidations.push(error),
		},
		onEvent: (event) => events.push(event),
	});

	const first = generator.generate({ promptText: "First request" });
	const firstRejection = assert.rejects(first, { code: "CANCELED" });
	const second = generator.generate({ promptText: "Second request" });
	const secondRejection = assert.rejects(second, { code: "CANCELED" });
	rejectFirst(new PollinationsError("private detail", "unauthorized", 401));

	await firstRejection;
	assert.deepEqual(invalidations, []);
	assert.equal(
		events.filter((event) => event.error?.code === "AUTHORIZATION_REQUIRED")
			.length,
		0,
	);

	generator.cancel();
	await secondRejection;
	assert.deepEqual(invalidations, []);
});

test("does not repeat a potentially billed agent request after a transient error", async () => {
	let calls = 0;
	const expected = { choices: [{ message: { content: "{}" } }] };
	const client = {
		chat: async () => {
			calls += 1;
			if (calls === 1) {
				throw new PollinationsError(
					"private detail",
					"temporary",
					503,
					undefined,
					undefined,
					0.001,
				);
			}
			return expected;
		},
	};

	const generator = new PollinationsMidiClient({
		auth: { requireClient: () => client },
	});
	await assert.rejects(generator.generate({ promptText: "Compose a phrase" }), {
		code: "PROVIDER_UNAVAILABLE",
	});
	assert.equal(calls, 1);
});

test("rate limits do not schedule another paid request", async () => {
	let calls = 0;
	const client = {
		chat: async () => {
			calls += 1;
			throw new PollinationsError(
				"private detail",
				"busy",
				429,
				undefined,
				undefined,
				30,
			);
		},
	};

	const generator = new PollinationsMidiClient({
		auth: { requireClient: () => client },
	});
	await assert.rejects(generator.generate({ promptText: "Compose a phrase" }), {
		code: "RATE_LIMITED",
	});
	assert.equal(calls, 1);
});

test("invalidates authorization when generation is rejected with 401", async () => {
	const invalidations = [];
	const auth = {
		requireClient: () => ({
			chat: async () => {
				throw new PollinationsError("private detail", "unauthorized", 401);
			},
		}),
		invalidate: async (error) => invalidations.push(error),
	};
	const generator = new PollinationsMidiClient({ auth });

	await assert.rejects(
		() => generator.generate({ promptText: "Create MIDI" }),
		{
			code: "AUTHORIZATION_REQUIRED",
		},
	);
	assert.deepEqual(invalidations, [
		{ code: "AUTHORIZATION_REQUIRED", message: "Reconnect to Pollinations." },
	]);
});

test("returns safe model metadata", async () => {
	const { auth } = createHarness();
	const generator = new PollinationsMidiClient({ auth });
	assert.deepEqual(await generator.models(), [
		{
			name: "midijourney",
			description: "Music model",
			tier: null,
			contextLength: 32000,
			supportsSystemMessages: true,
		},
	]);
});

test("maps provider failures to actionable safe categories", () => {
	for (const status of [400, 404]) {
		const rejection = classifyGenerationError(
			new PollinationsError("private provider detail", "bad", status),
		);
		assert.match(
			rejection.message,
			new RegExp(`MIDI Journey agent request \\(HTTP ${status}\\)`),
		);
		assert.doesNotMatch(
			rejection.message,
			/private provider detail|selected Pollinations model/,
		);
	}
	assert.equal(
		classifyGenerationError(
			new PollinationsError("private detail", "unauthorized", 401),
		).code,
		"AUTHORIZATION_REQUIRED",
	);
	assert.equal(
		classifyGenerationError(
			new PollinationsError("private detail", "balance", 402),
		).code,
		"INSUFFICIENT_POLLEN",
	);
	assert.equal(
		classifyGenerationError(
			new PollinationsError("private detail", "rate", 429),
		).code,
		"RATE_LIMITED",
	);
	assert.equal(
		classifyGenerationError(new PollinationsError("private detail", "bad", 400))
			.code,
		"INVALID_PROVIDER_REQUEST",
	);
	assert.equal(
		classifyGenerationError(
			new PollinationsError("private detail", "denied", 403),
		).code,
		"PERMISSION_DENIED",
	);
	assert.equal(
		classifyGenerationError(
			new PollinationsError("private detail", "server", 503),
		).code,
		"PROVIDER_UNAVAILABLE",
	);
	assert.deepEqual(classifyGenerationError({ name: "AbortError" }), {
		code: "CANCELED",
		message: "Generation canceled.",
	});
});
