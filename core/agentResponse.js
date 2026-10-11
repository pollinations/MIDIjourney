const { parseDocument, isMap, isScalar } = require("yaml");
const {
	parseMidiClipResponse,
	MidiValidationError,
} = require("./encoding/midiClip.js");
const { redactSecrets } = require("./history.js");

const MAX_TRANSPORT = 2_000_000;
const MAX_ANSWER = 64_000;
const MAX_MIDI = 512_000;

// Managed agents put escaped tool transcripts in message.content, not only in
// message.tool_calls. Scan balanced blocks; never parse MIDI from tool output.
function separateToolTraces(raw) {
	const tags = /<details\b[^>]*>|<\/details\s*>/gi;
	let cursor = 0,
		depth = 0,
		toolCount = 0,
		text = "";
	for (const match of raw.matchAll(tags)) {
		const closing = /^<\//.test(match[0]);
		if (
			!depth &&
			!closing &&
			/\btype\s*=\s*["'](?:tool_calls|error)["']/i.test(match[0])
		) {
			text += raw.slice(cursor, match.index);
			depth = 1;
			toolCount++;
		} else if (depth) {
			depth += closing ? -1 : 1;
			if (!depth) cursor = match.index + match[0].length;
		}
	}
	if (!depth) text += raw.slice(cursor);
	return { text: text.trim(), toolCount, incomplete: depth > 0 };
}

function contentText(content) {
	if (typeof content === "string") return content;
	if (!Array.isArray(content) || content.length > 128) return "";
	return content
		.map((part) => {
			if (part?.type === "text" && typeof part.text === "string")
				return part.text;
			if (part?.type === "image_url") {
				try {
					const url = new URL(part.image_url?.url);
					if (url.protocol === "https:" && !url.username && !url.password) {
						return `![Image](<${url.href}>)`;
					}
				} catch {
					/* Unsupported media is not executable content. */
				}
			}
			return "";
		})
		.join("\n\n");
}

function looksLikeMidi(value) {
	return (
		/(?:^|\n)notation\s*:/m.test(value) ||
		(/^\s*\{/.test(value) && /"notes"\s*:/.test(value))
	);
}

// Only scalar display fields are read on invalid MIDI; no YAML object/alias
// expansion, note coercion, or tool-code execution.
function displayMetadata(value) {
	const doc = parseDocument(value, {
		schema: "core",
		strict: true,
		uniqueKeys: true,
		merge: false,
		resolveKnownTags: false,
	});
	const fields = {};
	if (
		doc.errors.length ||
		doc.warnings.length ||
		!isMap(doc.contents) ||
		doc.contents.tag ||
		doc.contents.anchor
	)
		return fields;
	for (const { key, value: scalar } of doc.contents.items) {
		if (
			isScalar(key) &&
			isScalar(scalar) &&
			!key.tag &&
			!key.anchor &&
			!scalar.tag &&
			!scalar.anchor &&
			["explanation", "error", "image", "notation"].includes(key.value) &&
			typeof scalar.value === "string"
		) {
			fields[key.value] = scalar.value;
		}
	}
	return fields;
}

function parseAgentResponse(content, { finishReason } = {}) {
	const raw = contentText(content).replace(/\r\n?/g, "\n");
	if (!raw.trim())
		throw new MidiValidationError("Pollinations returned an empty reply.");
	if (raw.length > MAX_TRANSPORT)
		throw new MidiValidationError(
			"The agent reply is too large to display safely.",
		);
	const traces = separateToolTraces(raw);
	const answer = redactSecrets(traces.text);
	let midi = null,
		midiWarning = "",
		count = 0,
		incompleteMidi = false;
	const prose = [];

	function candidate(value) {
		count++;
		if (value.length > MAX_MIDI) {
			midiWarning = "The MIDI attachment is too large. Ask for a shorter clip.";
			return;
		}
		try {
			const parsed = parseMidiClipResponse(value);
			if (count === 1) midi = parsed;
		} catch (error) {
			const fields = displayMetadata(value);
			if (fields.error) prose.push(fields.error);
			else if (fields.explanation) prose.push(fields.explanation);
			// Older agent instructions append empty notation even to image replies.
			// Keep that image, but do not pretend that an empty header is MIDI.
			const mediaOnly =
				fields.image &&
				fields.notation?.trim() === "pitch,time,duration,velocity";
			const imageUrl = fields.image?.match(/https:\/\/[^\s)>"']+/)?.[0];
			if (
				fields.image &&
				(!imageUrl || !prose.some((part) => part.includes(imageUrl)))
			)
				prose.push(fields.image);
			if (!fields.error && !mediaOnly)
				midiWarning = `MIDI could not be used: ${error.message}`;
		}
	}

	function outside(value) {
		const unfinishedFence = /^(?:`{3,}|~{3,})[^\n]*\n/m.exec(value);
		if (unfinishedFence && looksLikeMidi(value.slice(unfinishedFence.index))) {
			prose.push(value.slice(0, unfinishedFence.index));
			incompleteMidi = true;
			midiWarning =
				"The MIDI block is incomplete. Ask the agent to resend the complete clip.";
			return;
		}
		// Current agents emit a bare YAML document after prose/media. Future
		// replies use explicit fences; both still go through the same validator.
		const start = /^(?:title|notation|duration|key|explanation):/m.exec(value);
		if (start && looksLikeMidi(value.slice(start.index))) {
			prose.push(value.slice(0, start.index));
			candidate(value.slice(start.index).trim());
		} else if (looksLikeMidi(value)) candidate(value.trim());
		else prose.push(value);
	}

	// Line-delimited fences only. Non-MIDI code stays ordinary Markdown.
	const fences =
		/^(?<fence>`{3,}|~{3,})(?<lang>[^\n]*)\n(?<body>[\s\S]*?)^\k<fence>[ \t]*(?:\n|$)/gm;
	let cursor = 0;
	for (const match of answer.matchAll(fences)) {
		outside(answer.slice(cursor, match.index));
		const body = match.groups.body.trim();
		if (looksLikeMidi(body)) candidate(body);
		else prose.push(match[0]);
		cursor = match.index + match[0].length;
	}
	outside(answer.slice(cursor));
	if (incompleteMidi) midi = null;
	if (count > 1) {
		midi = null;
		midiWarning =
			"The reply contains multiple MIDI blocks. Ask for one clip at a time.";
	}
	if (finishReason === "length" || traces.incomplete) {
		midi = null;
		midiWarning =
			"The reply was cut off. Ask the agent to resend the complete result.";
	}
	let text = prose
		.map((part) => part.trim())
		.filter(Boolean)
		.join("\n\n");
	if (text.length > MAX_ANSWER) {
		text = text.slice(0, MAX_ANSWER);
		midiWarning ||= "The reply is too long to display in full.";
	}
	if (!text && !midi && !midiWarning)
		text = "The agent finished without a readable answer. Please try again.";
	return { text, midi, midiWarning, toolCount: traces.toolCount };
}

exports.parseAgentResponse = parseAgentResponse;
exports.separateToolTraces = separateToolTraces;
