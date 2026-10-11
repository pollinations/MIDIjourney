const { normalizeMidiClip } = require("./encoding/midiClip.js");
const { CONFIG } = require("./config.js");

// Deliberately a whole-request grammar, not a keyword classifier. Questions,
// negation, model preferences and compound creative edits belong to the agent.
function parseTranspose(instruction) {
	const text = instruction
		.trim()
		.replace(/^please\s+/i, "")
		.replace(/[.!]$/, "")
		.replace(/,?\s+please$/i, "")
		.trim();
	const prefix =
		"(?:transpose|shift|move)(?: (?:it|this|the (?:clip|midi|notes)))?";
	const interval = text.match(
		new RegExp(
			`^${prefix} (up|down)(?: by)? (an?|one|two|[1-9][0-9]?) (octaves?|semitones?)$`,
			"i",
		),
	);
	if (interval) {
		const count =
			{ a: 1, an: 1, one: 1, two: 2 }[interval[2].toLowerCase()] ||
			Number(interval[2]);
		return {
			semitones:
				count *
				(/octave/i.test(interval[3]) ? 12 : 1) *
				(/up/i.test(interval[1]) ? 1 : -1),
		};
	}
	const keys = text.match(
		new RegExp(
			`^${prefix} from ([a-g](?:#|b)?) (major|minor) to ([a-g](?:#|b)?) (major|minor)$`,
			"i",
		),
	);
	if (!keys || keys[2].toLowerCase() !== keys[4].toLowerCase()) return null;
	const pitchClass = (note) =>
		(({ c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 })[note[0].toLowerCase()] +
			(note[1] === "#" ? 1 : note[1]?.toLowerCase() === "b" ? -1 : 0) +
			12) %
		12;
	const distance = (pitchClass(keys[3]) - pitchClass(keys[1]) + 12) % 12;
	// A tritone has no uniquely shortest direction; leave it to the agent.
	if (distance === 6) return null;
	return {
		semitones: distance > 6 ? distance - 12 : distance,
		key:
			keys[3][0].toUpperCase() +
			keys[3].slice(1).toLowerCase() +
			" " +
			keys[4].toLowerCase(),
	};
}

function tryExactTransform(request, input = {}) {
	const operation = parseTranspose(request.instruction);
	if (!operation) return null;
	const sources =
		request.sourceClips || (request.sourceClip ? [request.sourceClip] : []);
	if (sources.length !== 1 || !sources[0].notes?.length) {
		return {
			text: "Select one MIDI clip to transpose exactly, then send that request again.",
			midi: null,
		};
	}
	const source = sources[0];
	const rawNotes = input.sourceClips?.[0]?.notes || input.notes || source.notes;
	if (
		input.exactTransformUnsafe ||
		rawNotes.length !== source.notes.length ||
		!supportsExactSource({ ...source, notes: rawNotes })
	) {
		// The generation result format cannot preserve these expression fields.
		return {
			text: "This clip has note properties, muted notes or a loop boundary I cannot preserve in an exact transposition yet. The original clip is unchanged.",
			midi: null,
		};
	}
	const notes = source.notes.map((note) => ({
		...note,
		pitch: note.pitch + operation.semitones,
	}));
	if (notes.some((note) => note.pitch < 0 || note.pitch > 127)) {
		return {
			text: "That transposition would put notes outside MIDI’s 0–127 pitch range. Choose a smaller interval; no notes were changed.",
			midi: null,
		};
	}
	const explanation = `Transposed ${operation.semitones >= 0 ? "up" : "down"} ${Math.abs(operation.semitones)} semitones locally, without an AI call. Timing, duration and velocity are unchanged.`;
	const midi = normalizeMidiClip({
		title: (source.title || "Transposed clip").slice(0, CONFIG.maxTitleLength),
		explanation,
		key: operation.key || (operation.semitones % 12 === 0 ? source.key : null),
		duration: source.duration,
		notes,
	});
	return { midi, text: "" };
}

exports.parseTranspose = parseTranspose;
exports.tryExactTransform = tryExactTransform;
exports.supportsExactSource = supportsExactSource;

function supportsExactSource(source) {
	return (
		Array.isArray(source?.notes) &&
		source.notes.length <= CONFIG.maxInputNotes &&
		source.notes.every(
			(note) =>
				!note.mute &&
				Number.isInteger(note.velocity) &&
				note.velocity >= 1 &&
				(note.probability === undefined || note.probability === 1) &&
				!note.velocity_deviation &&
				(note.release_velocity === undefined || note.release_velocity === 64) &&
				note.start_time + note.duration <= source.duration,
		)
	);
}
