import assert from "node:assert/strict";
import test from "node:test";
import { accountDestination } from "../account-links.mjs";

test("account actions preserve their destination without exporting local return URLs", () => {
	assert.equal(
		accountDestination("https://pollinations.ai/?redirect=private#extra"),
		"https://pollinations.ai/",
	);
	for (const path of ["/pollen", "/top-up"])
		assert.equal(
			accountDestination(
				`https://enter.pollinations.ai${path}?redirect=http%3A%2F%2F127.0.0.1%3A5178%2F%23live-session%3Dprivate#extra`,
			),
			`https://enter.pollinations.ai${path}`,
		);
	assert.equal(
		accountDestination(
			"https://enter.pollinations.ai/edit-key?id=key_123&redirect=private",
		),
		"https://enter.pollinations.ai/edit-key?id=key_123",
	);
	for (const url of [
		"javascript:alert(1)",
		"https://example.com/top-up",
		"https://pollinations.ai/other",
		"https://pollinations.ai.example.com/",
		"https://enter.pollinations.ai/other",
		"https://enter.pollinations.ai/edit-key",
		"https://enter.pollinations.ai/edit-key?id=not%20an%20id",
	])
		assert.equal(accountDestination(url), null);
});
