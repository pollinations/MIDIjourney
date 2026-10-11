import assert from "node:assert/strict";
import test from "node:test";
import { observeChat } from "../src/call-log.mjs";
import { providerErrorDetails } from "../src/provider-error.mjs";
import { normalizeChat } from "../src/session.mjs";

test("agent rejections preserve useful reason and request ID without copying SDK details", () => {
	assert.deepEqual(
		providerErrorDetails({
			status: 400,
			code: "INVALID_REQUEST",
			requestId: "12345678-abcd-1234-5678-123456789abc",
			message: "Unsupported parameter: response_format",
			details: { headers: { Authorization: "do not copy" } },
		}),
		{
			httpStatus: 400,
			code: "INVALID_REQUEST",
			requestId: "12345678-abcd-1234-5678-123456789abc",
			message: "Unsupported parameter: response_format",
		},
	);
});

test("rejection diagnostics omit credentials, URLs, and echoed request messages", () => {
	const result = providerErrorDetails(
		{
			status: 404,
			code: "sk_not-a-code",
			requestId: "https://example.com?token=secret",
			message:
				"Not found: opaque-credential pk_example123 sk_example456 Bearer bearer-value eyJabc.def.ghi https://example.com?key=private private prompt\nretry",
		},
		{ apiKey: "opaque-credential" },
		[{ content: "private prompt" }],
	);
	assert.equal(result.code, null);
	assert.equal(result.requestId, null);
	assert.match(result.message, /Not found:/);
	assert.doesNotMatch(
		JSON.stringify(result),
		/opaque-credential|pk_example|sk_example|bearer-value|eyJabc|example.com|private prompt/,
	);
});

test("provider diagnostic retention is bounded and does not stringify arbitrary errors", () => {
	assert.equal(
		providerErrorDetails({ status: 400, message: "x".repeat(2000) }).message
			.length,
		1000,
	);
	assert.equal(
		providerErrorDetails({ status: 400, message: "x".repeat(32_001) }).message,
		undefined,
	);
	assert.equal(
		providerErrorDetails({ status: 503, message: "Private response body" })
			.message,
		undefined,
	);
	assert.equal(
		providerErrorDetails({ status: 400, message: {} }).message,
		undefined,
	);
});

test("a rejected SDK attempt retains diagnostic details after chat normalization", async () => {
	const failure = Object.assign(new Error("Unknown agent endpoint"), {
		code: "MODEL_NOT_FOUND",
		status: 404,
		requestId: "request-123",
	});
	const calls = [];
	const observed = observeChat(
		{
			chat: async () => {
				throw failure;
			},
		},
		(entry) => calls.push(entry),
		() => 1,
	);
	await assert.rejects(
		observed.chat([{ role: "user", content: "private prompt" }], {
			model: "community/pollinations-ai/midijourney",
		}),
		(error) => error === failure,
	);
	const restored = normalizeChat({
		turns: [{ prompt: "private prompt", calls: [calls.at(-1)] }],
	}).turns[0];
	assert.deepEqual(restored.calls[0].error, {
		code: "MODEL_NOT_FOUND",
		httpStatus: 404,
		requestId: "request-123",
		message: "Unknown agent endpoint",
	});
	assert.doesNotMatch(JSON.stringify(restored.calls), /private prompt/);
});
