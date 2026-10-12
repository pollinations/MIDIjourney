import assert from "node:assert/strict";
import test from "node:test";
import {
	clipCreationUnavailable,
	clipWriteAction,
	clipWriteFeedback,
} from "../src/reply-presentation.mjs";

test("creation feedback accepts empty or occupied MIDI slots and explains unavailable targets", () => {
	assert.equal(
		clipCreationUnavailable({ connected: false }),
		"Please select a clip.",
	);
	assert.equal(
		clipCreationUnavailable({
			connected: false,
			error: "Select a MIDI clip or empty slot on a MIDI track.",
		}),
		"Please select a clip.",
	);
	assert.equal(
		clipCreationUnavailable({ connected: true, source: null }),
		undefined,
	);
	assert.equal(
		clipCreationUnavailable({ connected: true, source: { title: "Input" } }),
		undefined,
	);
	assert.equal(
		clipCreationUnavailable({ connected: true, checking: true }),
		"Checking Live…",
	);
});

test("creation feedback preserves connector and recording errors", () => {
	for (const error of [
		"The Live connector is not responding.",
		"Stop recording into the selected clip before replacing it.",
	])
		assert.equal(clipCreationUnavailable({ connected: false, error }), error);
});

test("write feedback keeps actionable failures while shortening detailed diagnostics", () => {
	assert.equal(
		clipWriteFeedback(
			"Live could not write the clip. Raw API details. Inspect it and use Undo if needed; no write was retried.",
		),
		"Couldn't write the clip. Check it in Live; use Undo if needed.",
	);
	assert.equal(
		clipWriteFeedback("Live has not confirmed the write. Raw details."),
		"Couldn't confirm the clip. Check it in Live before writing again.",
	);
	const selection = "The selection changed. No changes made.";
	assert.equal(clipWriteFeedback(selection), selection);
});

test("write action follows the destination slot, even when another input clip remains selected", () => {
	assert.equal(
		clipWriteAction({
			connected: true,
			clipId: 0,
			source: { title: "Previous selection" },
		}),
		"Write to selected empty slot",
	);
	assert.equal(
		clipWriteAction({ connected: true, clipId: 42, source: null }),
		"Replace selected clip",
	);
	for (const live of [
		{ connected: true },
		{ connected: false, clipId: 42 },
		{ connected: true, checking: true, clipId: 0 },
	])
		assert.equal(clipWriteAction(live), "Write to selected slot");
});
