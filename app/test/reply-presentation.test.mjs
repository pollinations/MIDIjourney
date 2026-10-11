import assert from "node:assert/strict";
import test from "node:test";
import { clipCreationUnavailable } from "../src/reply-presentation.mjs";

test("creation feedback accepts empty or occupied MIDI slots and explains unavailable targets", () => {
	assert.equal(clipCreationUnavailable({ connected: false }), "Please select a clip.");
	assert.equal(clipCreationUnavailable({ connected: false, error: "Select a MIDI clip or empty slot on a MIDI track." }), "Please select a clip.");
	assert.equal(clipCreationUnavailable({ connected: true, source: null }), undefined);
	assert.equal(clipCreationUnavailable({ connected: true, source: { title: "Input" } }), undefined);
	assert.equal(clipCreationUnavailable({ connected: true, checking: true }), "Checking Live…");
});

test("creation feedback preserves connector and recording errors", () => {
	for (const error of ["The Live connector is not responding.", "Stop recording into the selected clip before replacing it."])
		assert.equal(clipCreationUnavailable({ connected: false, error }), error);
});
