import assert from "node:assert/strict";
import test from "node:test";
import { liveThemeProperties } from "../src/live-theme.mjs";

const base = { background: [0.2, 0.2, 0.2, 1], text: [0.9, 0.9, 0.9, 1] };

test("host RGBA accents pass through without choosing a brand hue", () => {
	for (const controlOn of [
		[0, 0.8, 0.6, 1],
		[0.6, 0.2, 1, 0.5],
		[1, 0.7, 0, 1],
	]) {
		const properties = liveThemeProperties(
			"dark",
			JSON.stringify({ ...base, controlOn }),
		);
		assert.equal(
			properties["--mj-live-controlOn"],
			`rgb(${controlOn
				.slice(0, 3)
				.map((v) => Math.round(v * 255))
				.join(" ")} / ${controlOn[3]})`,
		);
	}
});

test("missing roles clear earlier inline colors and use neutral host-derived fallbacks", () => {
	const properties = liveThemeProperties("light", JSON.stringify(base));
	assert.equal(properties["--mj-live-controlOn"], "");
	assert.equal(properties["--mj-live-background"], "rgb(51 51 51 / 1)");
});

test("invalid required colors are rejected and optional values cannot inject CSS", () => {
	for (const payload of [
		"invalid",
		"null",
		"{}",
		JSON.stringify({ ...base, text: [0, 0, 0, 2] }),
	])
		assert.equal(liveThemeProperties("dark", payload), null);
	assert.equal(liveThemeProperties("unknown", JSON.stringify(base)), null);
	const properties = liveThemeProperties(
		"dark",
		JSON.stringify({ ...base, controlOn: "url(example)", other: [1, 0, 0, 1] }),
	);
	assert.equal(properties["--mj-live-controlOn"], "");
	assert.equal(properties["--mj-live-other"], undefined);
});
