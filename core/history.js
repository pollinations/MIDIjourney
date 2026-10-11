const { CONFIG } = require("./config.js");
const { sanitizeInputNotes } = require("./encoding/midiClip.js");
const MAX_SOURCE_CLIPS = 8;

const SECRET_PATTERN = /\b(?:sk|pk)_[A-Za-z0-9_-]{12,}\b/g;

function redactSecrets(value) {
	return String(value ?? "").replace(SECRET_PATTERN, "[redacted credential]");
}

function safeText(value, maxLength = 50000) {
	return redactSecrets(value).slice(0, maxLength);
}

function normalizeHistory(history) {
	if (!Array.isArray(history)) return [];
	return history
		.filter(
			(entry) =>
				entry &&
				(entry.role === "user" || entry.role === "assistant") &&
				typeof entry.content === "string",
		)
		.slice(-CONFIG.maxHistoryMessages)
		.map((entry) => ({
			role: entry.role,
			content: safeText(entry.content, CONFIG.maxHistoryEntryLength),
			contextContent:
				typeof entry.contextContent === "string"
					? safeText(entry.contextContent, CONFIG.maxContextEntryLength)
					: safeText(entry.content, CONFIG.maxContextEntryLength),
		}));
}

function buildRequest(input) {
	const promptText = safeText(input?.promptText, CONFIG.maxPromptLength).trim();
	if (!promptText) {
		const error = new Error("Describe the MIDI you want to create.");
		error.code = "PROMPT_REQUIRED";
		throw error;
	}

	const notes = sanitizeInputNotes(input?.notes);
	const requestedDuration =
		typeof input?.duration === "number" &&
		Number.isFinite(input.duration) &&
		input.duration > 0 &&
		input.duration <= CONFIG.maxClipBeats
			? input.duration
			: 8;
	const sourceClip = notes.length
		? {
				title: safeText(input?.title, 100).trim() || null,
				key: safeText(input?.key, 40).trim() || null,
				duration: requestedDuration,
				notes,
			}
		: null;

	// Opt-in multi-clip input. Keep the original single-clip request unchanged.
	if (Array.isArray(input?.sourceClips)) {
		if (input.sourceClips.length > MAX_SOURCE_CLIPS) {
			throw new Error(
				`Attach up to ${MAX_SOURCE_CLIPS} MIDI clips per message.`,
			);
		}
		return {
			instruction: promptText,
			requestedDuration,
			sourceClips: input.sourceClips.map((clip) => ({
				title: safeText(clip?.title, 100).trim() || null,
				key: safeText(clip?.key, 40).trim() || null,
				duration:
					typeof clip?.duration === "number" &&
					Number.isFinite(clip.duration) &&
					clip.duration > 0 &&
					clip.duration <= CONFIG.maxClipBeats
						? clip.duration
						: 8,
				notes: sanitizeInputNotes(clip?.notes),
			})),
		};
	}

	return {
		instruction: promptText,
		requestedDuration,
		sourceClip,
	};
}

function buildContext(history, historyEnabled) {
	if (!historyEnabled) return [];
	const recent = normalizeHistory(history).slice(-CONFIG.maxContextMessages);
	const selected = [];
	let characters = 0;
	for (let index = recent.length - 1; index >= 0; index -= 1) {
		const { role, contextContent } = recent[index];
		if (characters + contextContent.length > CONFIG.maxContextCharacters)
			continue;
		selected.unshift({ role, content: contextContent });
		characters += contextContent.length;
	}
	return selected;
}

function displayUserContent(request) {
	return `# Prompt\n${request.instruction}\n\n# Response`;
}

function displayAssistantContent(clip) {
	const explanation = safeText(clip.explanation, 1000).replace(/\n/g, " ");
	const key = clip.key || "unknown";
	const notation = clip.notes
		.map(
			(note) =>
				`${note.pitch},${note.start_time},${note.duration},${note.velocity}`,
		)
		.join("\n");
	return `title: ${safeText(clip.title, CONFIG.maxTitleLength)}
duration: ${clip.duration}
key: ${safeText(key, 40)}
explanation: >-
  ${explanation}
notation: |-
  pitch,time,duration,velocity
  ${notation.replace(/\n/g, "\n  ")}`;
}

function serializeContext(value) {
	if (Array.isArray(value?.sourceClips)) {
		const withNotes = (count) => ({
			...value,
			sourceClips: value.sourceClips.map((clip) => ({
				...clip,
				notes: clip.notes.slice(0, count),
				...(clip.notes.length > count
					? { omittedNotes: clip.notes.length - count }
					: {}),
			})),
		});
		let serialized = JSON.stringify(value);
		if (serialized.length <= CONFIG.maxContextEntryLength) return serialized;
		let low = 0,
			high = Math.max(0, ...value.sourceClips.map((clip) => clip.notes.length));
		serialized = JSON.stringify(withNotes(0));
		while (low <= high) {
			const middle = Math.floor((low + high) / 2);
			const candidate = JSON.stringify(withNotes(middle));
			if (candidate.length <= CONFIG.maxContextEntryLength) {
				serialized = candidate;
				low = middle + 1;
			} else high = middle - 1;
		}
		return serialized;
	}
	const notes = Array.isArray(value?.notes)
		? value.notes
		: Array.isArray(value?.sourceClip?.notes)
			? value.sourceClip.notes
			: null;
	const withNotes = (count) => {
		if (Array.isArray(value?.notes))
			return { ...value, notes: notes.slice(0, count) };
		if (Array.isArray(value?.sourceClip?.notes)) {
			return {
				...value,
				sourceClip: { ...value.sourceClip, notes: notes.slice(0, count) },
			};
		}
		return value;
	};

	const serialized = JSON.stringify(value);
	if (serialized.length <= CONFIG.maxContextEntryLength || !notes)
		return serialized;

	let low = 0;
	let high = notes.length;
	let best = JSON.stringify(withNotes(0));
	while (low <= high) {
		const middle = Math.floor((low + high) / 2);
		const candidate = JSON.stringify(withNotes(middle));
		if (candidate.length <= CONFIG.maxContextEntryLength) {
			best = candidate;
			low = middle + 1;
		} else {
			high = middle - 1;
		}
	}
	return best;
}

function appendHistory(history, request, clip, text = "") {
	const normalized = normalizeHistory(history);
	const userContext = serializeContext(request);
	const assistantText = safeText(text, CONFIG.maxContextEntryLength);
	const assistantContext = clip
		? serializeContext(
				assistantText ? { text: assistantText, midi: clip } : clip,
			)
		: assistantText;
	return [
		...normalized,
		{
			role: "user",
			content: displayUserContent(request),
			contextContent: userContext,
		},
		{
			role: "assistant",
			content: [assistantText, clip ? displayAssistantContent(clip) : ""]
				.filter(Boolean)
				.join("\n\n"),
			contextContent: assistantContext,
		},
	].slice(-CONFIG.maxHistoryMessages);
}

exports.appendHistory = appendHistory;
exports.buildContext = buildContext;
exports.buildRequest = buildRequest;
exports.normalizeHistory = normalizeHistory;
exports.redactSecrets = redactSecrets;
exports.MAX_SOURCE_CLIPS = MAX_SOURCE_CLIPS;
