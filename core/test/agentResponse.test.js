const test = require("node:test");
const assert = require("node:assert/strict");
const { parseAgentResponse } = require("../agentResponse.js");
const { PollinationsMidiClient } = require("../pollinationsClient.js");
const { buildContext } = require("../history.js");
const captured = require("./fixtures/managed-agent-replies.json");
const yaml =
	'title: "Phrase"\nexplanation: "A short melody."\nkey: "C major"\nduration: 4\nnotation: |-\n  pitch,time,duration,velocity\n  60,0,1,70\n  64,1.25,2.75,80';
const clip = {
	title: "Phrase",
	explanation: "A short melody.",
	key: "C major",
	duration: 4,
	notes: [{ pitch: 60, start_time: 0, duration: 1, velocity: 80 }],
};

test("ordinary Markdown and image-only replies are chat, not invalid MIDI", () => {
	for (const text of [
		"Syncopation stresses offbeats.",
		"## Rhythm\n\n- **Accent** the offbeat.\n- Leave space.",
		"![Bee](<https://media.pollinations.ai/bee>)",
		"[Audio](https://media.pollinations.ai/audio)",
	]) {
		const reply = parseAgentResponse(text);
		assert.equal(reply.text, text);
		assert.equal(reply.midi, null);
		assert.equal(reply.midiWarning, "");
	}
});

test("captured Claude tool reply yields its unchanged final 16-note clip", () => {
	const reply = parseAgentResponse(captured["current-claude"].content);
	assert.equal(reply.midi.title, "Skyline Skip");
	assert.equal(reply.midi.notes.length, 16);
	assert.equal(reply.midi.duration, 8);
	assert.equal(reply.toolCount, 2);
	assert.equal(reply.text, "");
	assert.equal(reply.midiWarning, "");
});

test("captured tool-budget error stays readable without a fake MIDI clip", () => {
	const reply = parseAgentResponse(captured["agent-claude"].content);
	assert.equal(reply.midi, null);
	assert.match(reply.text, /API key budget/);
	assert.doesNotMatch(reply.text, /<details|generateText|notation:/);
	assert.equal(reply.midiWarning, "");
});

test("captured image survives tool transcripts and dummy notation", () => {
	const reply = parseAgentResponse(captured["agent-image"].content);
	assert.match(reply.text, /^!\[Generated image\]/);
	assert.equal(reply.midi, null);
	assert.equal(reply.midiWarning, "");
	assert.equal((reply.text.match(/media\.pollinations\.ai/g) || []).length, 1);
	assert.doesNotMatch(reply.text, /<details|notation:|&quot;/);
});

test("plain YAML, fenced YAML, CRLF, tilde fences and JSON use the same validator", () => {
	for (const text of [
		yaml,
		`\`\`\`yaml\n${yaml}\n\`\`\``,
		`\`\`\`yml\n${yaml}\n\`\`\``.replace(/\n/g, "\r\n"),
		`~~~yaml\n${yaml}\n~~~`,
		JSON.stringify(clip),
		`\`\`\`json\n${JSON.stringify(clip)}\n\`\`\``,
	]) {
		const reply = parseAgentResponse(text);
		assert.equal(reply.midi.title, "Phrase");
		assert.equal(reply.text, "");
		assert.equal(reply.midiWarning, "");
	}
});

test("prose surrounding MIDI is preserved, including non-MIDI code blocks", () => {
	const reply = parseAgentResponse(
		"Here is a variation.\n\n```yaml\n" +
			yaml +
			"\n```\n\nTry a softer piano.\n\n```js\nconst beat = 4;\n```",
	);
	assert.equal(reply.midi.notes.length, 2);
	assert.match(reply.text, /Here is a variation/);
	assert.match(reply.text, /Try a softer piano/);
	assert.match(reply.text, /```js/);
	assert.doesNotMatch(reply.text, /notation:/);
});

test("bad note data never erases surrounding text or becomes a playable clip", () => {
	for (const invalid of [
		yaml.replace("60,0,1,70", "200,0,1,70"),
		yaml.replace("60,0,1,70", "60,0,1,seventy"),
		yaml.replace("60,0,1,70", "60,0,-1,70"),
		yaml.replace('title: "Phrase"', 'title: !custom "Phrase"'),
		`${yaml}\ntempo: 90`,
	]) {
		const reply = parseAgentResponse(
			`Musical explanation.\n\n\`\`\`yaml\n${invalid}\n\`\`\``,
		);
		assert.equal(reply.midi, null);
		assert.match(reply.text, /Musical explanation/);
		assert.match(reply.midiWarning, /MIDI could not be used/);
	}
});

test("only final answer MIDI is eligible, never notation hidden in a tool trace", () => {
	const reply = parseAgentResponse(
		'<details type="tool_calls">' +
			yaml +
			"<details>nested</details></details>\nThe tool failed.",
	);
	assert.equal(reply.midi, null);
	assert.equal(reply.text, "The tool failed.");
	assert.equal(reply.toolCount, 1);
});

test("incomplete replies and multiple clips never silently write partial MIDI", () => {
	for (const [content, options] of [
		[yaml, { finishReason: "length" }],
		[`\`\`\`yaml\n${yaml}`, {}],
		[`${yaml}\n<details type="tool_calls">unfinished`, {}],
		[`\`\`\`yaml\n${yaml}\n\`\`\`\n\`\`\`yaml\n${yaml}\n\`\`\``, {}],
	]) {
		const reply = parseAgentResponse(content, options);
		assert.equal(reply.midi, null);
		assert.ok(reply.midiWarning);
	}
});

test("text/image content parts are recognized without allowing executable URLs", () => {
	const reply = parseAgentResponse([
		{ type: "text", text: "An image:" },
		{
			type: "image_url",
			image_url: { url: "https://media.pollinations.ai/bee" },
		},
		{ type: "image_url", image_url: { url: "javascript:alert(1)" } },
	]);
	assert.match(reply.text, /An image:/);
	assert.match(reply.text, /!\[Image\]/);
	assert.doesNotMatch(reply.text, /javascript/);
});

test("transport and visible answer bounds are explicit", () => {
	assert.throws(() => parseAgentResponse(""), /empty reply/);
	assert.throws(() => parseAgentResponse("a".repeat(2_000_001)), /too large/);
	const bounded = parseAgentResponse("a".repeat(64_001));
	assert.equal(bounded.text.length, 64_000);
	assert.ok(bounded.midiWarning);
	const largeTrace = `<details type="tool_calls">${"x".repeat(600_000)}</details>\n${yaml}`;
	assert.equal(parseAgentResponse(largeTrace).midi.notes.length, 2);
});

test("a normal chat follow-up retains prose and source MIDI, not giant tool transcripts", async () => {
	const requests = [];
	const contents = [
		'<details type="tool_calls">private tool transcript</details>\nSyncopation accents offbeats.',
		`Here is your phrase.\n\`\`\`yaml\n${yaml}\n\`\`\``,
	];
	const generator = new PollinationsMidiClient({
		auth: {
			requireClient: () => ({
				chat: async (messages) => {
					requests.push(messages);
					return {
						choices: [
							{ message: { content: contents.shift() }, finish_reason: "stop" },
						],
					};
				},
			}),
		},
	});
	const first = await generator.generate({
		promptText: "Explain syncopation",
		notes: clip.notes,
	});
	assert.equal(
		first.notes,
		undefined,
		"source notes are never mistaken for a generated clip",
	);
	assert.equal(
		first.history[1].contextContent,
		"Syncopation accents offbeats.",
	);
	const second = await generator.generate({
		promptText: "Use that in a melody",
		history: first.history,
		historyStatus: true,
	});
	assert.equal(second.notes.length, 2);
	assert.equal(requests[1].find(message => message.role === "assistant").content, "Syncopation accents offbeats.");
	assert.equal(
		JSON.parse(requests[1].find(message => message.role === "user").content).sourceClip.notes[0].pitch,
		60,
	);
	assert.doesNotMatch(
		JSON.stringify(buildContext(second.history, true)),
		/private tool transcript/,
	);
});
