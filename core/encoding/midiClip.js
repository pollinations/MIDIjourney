const { CONFIG } = require("../config.js");
const { parseDocument, isMap, isScalar } = require("yaml");

const MAX_RESPONSE_CHARACTERS = 512_000;
const AGENT_METADATA_FIELDS = new Set([
  "title", "explanation", "key", "duration", "notation",
]);
const CSV_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

class MidiValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "MidiValidationError";
    this.code = "INVALID_MIDI_RESPONSE";
    this.details = details;
  }
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validateNote(note, index) {
  const errors = [];
  if (!note || typeof note !== "object" || Array.isArray(note)) {
    return [`notes[${index}] must be an object`];
  }
  if (!Number.isInteger(note.pitch) || note.pitch < 0 || note.pitch > 127) {
    errors.push(`notes[${index}].pitch must be an integer from 0 to 127`);
  }
  if (
    !isFiniteNumber(note.start_time) ||
    note.start_time < 0 ||
    note.start_time > CONFIG.maxClipBeats
  ) {
    errors.push(
      `notes[${index}].start_time must be between 0 and ${CONFIG.maxClipBeats}`,
    );
  }
  if (
    !isFiniteNumber(note.duration) ||
    note.duration <= 0 ||
    note.duration > CONFIG.maxClipBeats
  ) {
    errors.push(
      `notes[${index}].duration must be greater than 0 and no more than ${CONFIG.maxClipBeats}`,
    );
  }
  if (
    isFiniteNumber(note.start_time) &&
    isFiniteNumber(note.duration) &&
    note.start_time + note.duration > CONFIG.maxClipBeats
  ) {
    errors.push(`notes[${index}] must end by beat ${CONFIG.maxClipBeats}`);
  }
  if (!Number.isInteger(note.velocity) || note.velocity < 1 || note.velocity > 127) {
    errors.push(`notes[${index}].velocity must be an integer from 1 to 127`);
  }
  return errors;
}

function validateNotes(notes, { maxNotes = CONFIG.maxOutputNotes } = {}) {
  if (!Array.isArray(notes)) return ["notes must be an array"];
  if (notes.length === 0) return ["notes must contain at least one note"];
  if (notes.length > maxNotes) return [`notes cannot contain more than ${maxNotes} notes`];
  return notes.flatMap((note, index) => validateNote(note, index));
}

function validateSourceNote(note, index) {
  const errors = [];
  if (!note || typeof note !== "object" || Array.isArray(note)) {
    return [`notes[${index}] must be an object`];
  }
  if (!Number.isInteger(note.pitch) || note.pitch < 0 || note.pitch > 127) {
    errors.push(`notes[${index}].pitch must be an integer from 0 to 127`);
  }
  if (
    !isFiniteNumber(note.start_time) ||
    note.start_time < 0 ||
    note.start_time > CONFIG.maxClipBeats
  ) {
    errors.push(
      `notes[${index}].start_time must be between 0 and ${CONFIG.maxClipBeats}`,
    );
  }
  if (
    !isFiniteNumber(note.duration) ||
    note.duration <= 0 ||
    note.duration > CONFIG.maxClipBeats
  ) {
    errors.push(
      `notes[${index}].duration must be greater than 0 and no more than ${CONFIG.maxClipBeats}`,
    );
  }
  if (
    isFiniteNumber(note.start_time) &&
    isFiniteNumber(note.duration) &&
    note.start_time + note.duration > CONFIG.maxClipBeats
  ) {
    errors.push(`notes[${index}] must end by beat ${CONFIG.maxClipBeats}`);
  }
  if (!isFiniteNumber(note.velocity) || note.velocity < 0 || note.velocity > 127) {
    errors.push(`notes[${index}].velocity must be a finite number from 0 to 127`);
  }
  if (
    note.mute !== undefined &&
    note.mute !== false &&
    note.mute !== true &&
    note.mute !== 0 &&
    note.mute !== 1
  ) {
    errors.push(`notes[${index}].mute must be 0, 1, false, or true`);
  }
  return errors;
}

function sanitizeInputNotes(notes) {
  if (!Array.isArray(notes)) return [];
  const safeNotes = notes.slice(0, CONFIG.maxInputNotes).flatMap((note, index) => {
    const normalized = {
      pitch: Number(note?.pitch),
      start_time: Number(note?.start_time),
      duration: Number(note?.duration),
      velocity: note?.velocity,
      mute: note?.mute,
    };
    const errors = validateSourceNote(normalized, index);
    if (errors.length > 0) throw new MidiValidationError("The selected clip contains invalid MIDI.", errors);
    if (normalized.mute === true || normalized.mute === 1) return [];
    return [{
      pitch: normalized.pitch,
      start_time: normalized.start_time,
      duration: normalized.duration,
      velocity: normalized.velocity,
    }];
  });
  return safeNotes.sort(
    (a, b) => a.start_time - b.start_time || a.pitch - b.pitch || a.duration - b.duration,
  );
}

function stripCodeFence(content) {
  const trimmed = content.trim();
  const match = trimmed.match(/^```(?:json|yaml|yml)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function parseAgentNotation(notation) {
  if (typeof notation !== "string") {
    throw new MidiValidationError("The agent response is missing its CSV notation.");
  }
  const lines = notation.trim().split(/\r?\n/);
  const header = lines.shift().split(",").map((cell) => cell.trim());
  if (header.join(",") !== "pitch,time,duration,velocity") {
    throw new MidiValidationError("The agent response has an unsupported MIDI notation header.");
  }
  if (lines.length === 0 || lines.length > CONFIG.maxOutputNotes) {
    throw new MidiValidationError(`The agent notation must contain 1 to ${CONFIG.maxOutputNotes} notes.`);
  }
  return lines.map((line, index) => {
    const cells = line.split(",").map((cell) => cell.trim());
    if (
      cells.length !== 4 ||
      cells.some((cell) => !CSV_NUMBER.test(cell) || !Number.isFinite(Number(cell)))
    ) {
      throw new MidiValidationError("The agent returned an unreadable MIDI note.", [
        `notation row ${index + 1} must contain four numeric values`,
      ]);
    }
    const [pitch, start_time, duration, velocity] = cells.map(Number);
    return { pitch, start_time, duration, velocity };
  });
}

function parseAgentYaml(content) {
  const doc = parseDocument(content, {
    version: "1.2",
    schema: "core",
    strict: true,
    uniqueKeys: true,
    stringKeys: true,
    prettyErrors: false,
    merge: false,
    resolveKnownTags: false,
  });
  const root = doc.contents;
  if (
    doc.errors.length || doc.warnings.length || !isMap(root) ||
    root.tag || root.anchor || root.items.length > AGENT_METADATA_FIELDS.size
  ) {
    throw new MidiValidationError("The agent returned unsupported MIDI YAML.");
  }

  // Read only known scalar fields. Never resolve aliases, tags, or arbitrary
  // nested YAML into application objects.
  const metadata = {};
  for (const { key, value } of root.items) {
    if (
      !isScalar(key) || !AGENT_METADATA_FIELDS.has(key.value) || key.tag || key.anchor ||
      !isScalar(value) || value.tag || value.anchor || Object.hasOwn(metadata, key.value)
    ) {
      throw new MidiValidationError("The agent returned unsupported MIDI metadata.");
    }
    metadata[key.value] = value.value;
  }
  if (
    typeof metadata.title !== "string" ||
    (metadata.explanation != null && typeof metadata.explanation !== "string") ||
    (metadata.key != null && typeof metadata.key !== "string") ||
    (Object.hasOwn(metadata, "duration") && !isFiniteNumber(metadata.duration))
  ) {
    throw new MidiValidationError("The agent returned invalid MIDI metadata.");
  }
  const notes = parseAgentNotation(metadata.notation);
  return {
    title: metadata.title,
    explanation: metadata.explanation ?? "",
    key: metadata.key ?? null,
    duration: metadata.duration ?? notes.reduce(
      (end, note) => Math.max(end, note.start_time + note.duration), 0,
    ),
    notes,
  };
}

function parseMidiClipResponse(content) {
  if (typeof content !== "string" || content.trim() === "") {
    throw new MidiValidationError("Pollinations returned an empty MIDI response.");
  }
  if (content.length > MAX_RESPONSE_CHARACTERS) {
    throw new MidiValidationError("The generated MIDI response is too large.");
  }

  let payload;
  try {
    const text = stripCodeFence(content);
    // Accept JSON replies, but never reinterpret malformed JSON as
    // YAML (which could otherwise accept number words as strings).
    payload = text.startsWith("{") || text.startsWith("[")
      ? JSON.parse(text)
      : parseAgentYaml(text);
  } catch (error) {
    if (error instanceof MidiValidationError) throw error;
    throw new MidiValidationError("Pollinations returned MIDI in an unreadable format.");
  }
  return normalizeMidiClip(payload);
}

function normalizeMidiClip(payload) {
  const details = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new MidiValidationError("The generated MIDI response must be an object.");
  }

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  if (!title) details.push("title is required");
  if (title.length > CONFIG.maxTitleLength) {
    details.push(`title cannot exceed ${CONFIG.maxTitleLength} characters`);
  }

  const explanation =
    typeof payload.explanation === "string" ? payload.explanation.trim() : "";
  const key = typeof payload.key === "string" && payload.key.trim() ? payload.key.trim() : null;
  if (explanation.length > 1000) details.push("explanation cannot exceed 1000 characters");
  if (key && key.length > 40) details.push("key cannot exceed 40 characters");
  if (
    !isFiniteNumber(payload.duration) ||
    payload.duration <= 0 ||
    payload.duration > CONFIG.maxClipBeats
  ) {
    details.push(
      `duration must be a positive finite number no greater than ${CONFIG.maxClipBeats} beats`,
    );
  }

  details.push(...validateNotes(payload.notes));
  if (details.length > 0) {
    throw new MidiValidationError("Pollinations returned invalid MIDI.", details);
  }

  const notes = payload.notes
    .map((note) => ({
      pitch: note.pitch,
      start_time: note.start_time,
      duration: note.duration,
      velocity: note.velocity,
      mute: 0,
    }))
    .sort((a, b) => a.start_time - b.start_time || a.pitch - b.pitch || a.duration - b.duration);

  const noteEnd = Math.max(...notes.map((note) => note.start_time + note.duration));
  const duration = Math.max(payload.duration, noteEnd);

  return { title, explanation, key, duration, notes };
}

exports.MidiValidationError = MidiValidationError;
exports.normalizeMidiClip = normalizeMidiClip;
exports.parseMidiClipResponse = parseMidiClipResponse;
exports.sanitizeInputNotes = sanitizeInputNotes;
exports.validateNote = validateNote;
exports.validateNotes = validateNotes;
exports.validateSourceNote = validateSourceNote;
