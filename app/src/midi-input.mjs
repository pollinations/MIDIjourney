import {
	CONFIG,
	MAX_SOURCE_CLIPS,
	redactSecrets,
	sanitizeInputNotes,
} from "../.generated/midi-core.mjs";

import { validMidiColor } from "./midi-color.mjs";

export { MAX_SOURCE_CLIPS };

export function midiInputKey(live) {
	if (live.source) return `live:${live.sourceId || live.target || "selected"}`;
	return "";
}

export function snapshotMidiInput(key, source, summary) {
	return {
		key,
		summary,
		source: {
			title: summary.title,
			key:
				typeof source.key === "string"
					? redactSecrets(source.key).slice(0, 40)
					: null,
			duration:
				Number.isFinite(source.duration) &&
				source.duration > 0 &&
				source.duration <= CONFIG.maxClipBeats
					? source.duration
					: 8,
			notes: sanitizeInputNotes(source.notes),
		},
	};
}

// Input belongs to the current Live selection, never to saved draft state or
// an earlier reply. The current Max bridge can expose one clip only.
export function resolveMidiInputs(live) {
	const { source, summary } = resolveMidiInput(live);
	return {
		items: source ? [{ key: midiInputKey(live), source, summary }] : [],
	};
}

export function midiInputsFeedback(live) {
	if (live.checking) return { items: [], checking: true };
	try {
		return resolveMidiInputs(live);
	} catch (failure) {
		return {
			items: [],
			error: redactSecrets(
				failure instanceof Error
					? failure.message
					: "Could not read MIDI input.",
			),
		};
	}
}

// One selection rule for both the visible indicator and the generation request.
// The note count uses the original shared sanitizer, including mute/input limits.
export function resolveMidiInput(live) {
	if (live.sourceError) throw new Error(live.sourceError);
	if (live.checking) throw new Error("Reading MIDI…");
	const source = live.source || undefined;
	return {
		source,
		summary: {
			kind: source ? "live" : "none",
			title: source
				? redactSecrets(source.title || "").slice(0, CONFIG.maxTitleLength)
				: "",
			noteCount: sanitizeInputNotes(source?.notes).length,
			...(validMidiColor(source?.color) ? { color: source.color } : {}),
		},
	};
}

export function midiInputFeedback(live) {
	if (live.checking) return { checking: true };
	try {
		return { summary: resolveMidiInput(live).summary };
	} catch (failure) {
		return {
			error: redactSecrets(
				failure instanceof Error
					? failure.message
					: "Could not read MIDI input.",
			),
		};
	}
}

export function normalizeMidiInput(value) {
	if (
		!value ||
		!["live", "reply", "none"].includes(value.kind) ||
		!Number.isSafeInteger(value.noteCount) ||
		value.noteCount < 0 ||
		value.noteCount > CONFIG.maxInputNotes
	)
		return undefined;
	return {
		kind: value.kind,
		title:
			value.kind === "none"
				? ""
				: redactSecrets(
						typeof value.title === "string" ? value.title : "",
					).slice(0, CONFIG.maxTitleLength),
		noteCount: value.kind === "none" ? 0 : value.noteCount,
		...(value.kind !== "none" && validMidiColor(value.color)
			? { color: value.color }
			: {}),
	};
}
