import assert from "node:assert/strict";
import test from "node:test";
import { pollenLabel } from "../src/pollen-label.mjs";

test("Pollen labels distinguish an unavailable balance from zero and tiny balances", () => {
	for (const value of [null, undefined, NaN, Infinity])
		assert.equal(pollenLabel(value), "—");
	assert.equal(pollenLabel(0), "0.00");
	assert.equal(pollenLabel(-0.01), "0.00");
	assert.equal(pollenLabel(0.001), "<0.01");
	assert.equal(pollenLabel(0.01), "0.01");
});

test("Pollen labels keep two decimal places and abbreviate large balances", () => {
	for (const [value, label] of [
		[0.999, "1.00"],
		[4.2, "4.20"],
		[4.99, "4.99"],
		[5, "5.00"],
		[99.99, "99.99"],
		[125, "125.00"],
		[999, "999.00"],
		[999.9, "999.90"],
		[1200, "1.20K"],
		[1234567, "1.23M"],
	])
		assert.equal(pollenLabel(value), label);
});
