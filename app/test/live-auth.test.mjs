import assert from "node:assert/strict";
import test from "node:test";
import {
	authRequest,
	connectBrowserSession,
	fragmentValue,
	liveAuthCapability,
	pause,
} from "../src/live-auth.mjs";

test("only a real Live bridge may use a correctly shaped window capability", () => {
	const nonce = "a".repeat(64);
	const location = { hash: `#live-session=${nonce}` };
	assert.equal(fragmentValue(location.hash, "live-session"), nonce);
	assert.equal(fragmentValue("#live-session=invalid", "live-session"), null);
	assert.equal(liveAuthCapability({ location }), null);
	assert.equal(
		liveAuthCapability({
			location,
			webkit: { messageHandlers: { live: { postMessage() {} } } },
		}),
		null,
	);
	assert.equal(
		liveAuthCapability({ location, max: { outlet() {}, bindInlet() {} } }),
		nonce,
	);
	assert.equal(liveAuthCapability({ location, max: { outlet() {} } }), null);
});

test("handoff credentials use headers/body, never URLs; remote error bodies are not surfaced", async (t) => {
	const original = globalThis.fetch;
	t.after(() => {
		globalThis.fetch = original;
	});
	let called;
	globalThis.fetch = async (url, options) => {
		called = { url, options };
		return new Response('{"status":"received"}');
	};
	assert.deepEqual(
		await authRequest("complete", "fake-nonce", { apiKey: "fake-session" }),
		{ status: "received" },
	);
	assert.equal(called.url, "/api/auth/complete");
	assert.equal(called.options.headers.Authorization, "Bearer fake-nonce");
	assert.equal(called.options.body, '{"apiKey":"fake-session"}');
	globalThis.fetch = async () =>
		new Response("private failure detail", { status: 403 });
	await assert.rejects(
		authRequest("complete", "fake-nonce"),
		/connection expired/,
	);
});

test("polling cancels promptly and works with an already aborted signal", async () => {
	const abort = new AbortController();
	const waiting = pause(abort.signal, 60_000);
	abort.abort();
	await assert.rejects(waiting, /Canceled/);
	await assert.rejects(pause(abort.signal), /Canceled/);
});

test("automatic browser connection validates the flow before requesting SDK login", async (t) => {
	const original = globalThis.fetch;
	t.after(() => {
		globalThis.fetch = original;
	});
	const calls = [];
	globalThis.fetch = async (url) => {
		calls.push(url);
		return Response.json({ status: "pending" });
	};
	assert.equal(
		await connectBrowserSession(
			"fake-flow",
			null,
			new AbortController().signal,
		),
		"login",
	);
	assert.deepEqual(calls, ["/api/auth/browser-status"]);
	assert.equal(
		await connectBrowserSession(
			"fake-flow",
			"previously-cached-session",
			new AbortController().signal,
		),
		"login",
	);
	assert.deepEqual(calls, [
		"/api/auth/browser-status",
		"/api/auth/browser-status",
	]);
	globalThis.fetch = async () => new Response("", { status: 403 });
	await assert.rejects(
		connectBrowserSession("expired-flow", null, new AbortController().signal),
		/expired/,
	);
});

test("automatic handoff sends the session once and waits for Live acknowledgement", async (t) => {
	const original = globalThis.fetch;
	t.after(() => {
		globalThis.fetch = original;
	});
	const calls = [];
	let polls = 0;
	globalThis.fetch = async (url, options) => {
		calls.push(url);
		if (url.endsWith("/complete")) {
			assert.equal(options.body, JSON.stringify({ apiKey: "fake-session" }));
			return Response.json({ status: "received" });
		}
		return Response.json({ status: ++polls === 3 ? "delivered" : "pending" });
	};
	assert.equal(
		await connectBrowserSession(
			"fake-flow",
			"fake-session",
			new AbortController().signal,
			true,
		),
		"connected",
	);
	assert.deepEqual(calls, [
		"/api/auth/browser-status",
		"/api/auth/complete",
		"/api/auth/browser-status",
		"/api/auth/browser-status",
	]);
});

test("already acknowledged browser handoffs never send credentials again", async (t) => {
	const original = globalThis.fetch;
	t.after(() => {
		globalThis.fetch = original;
	});
	globalThis.fetch = async (url) => {
		assert.equal(url, "/api/auth/browser-status");
		return Response.json({ status: "delivered" });
	};
	assert.equal(
		await connectBrowserSession(
			"fake-flow",
			"fake-session",
			new AbortController().signal,
		),
		"connected",
	);
});

test("aborting a browser connection prevents delivery and late success", async (t) => {
	const original = globalThis.fetch;
	t.after(() => {
		globalThis.fetch = original;
	});
	const controller = new AbortController();
	globalThis.fetch = async (url) => {
		assert.equal(url, "/api/auth/browser-status");
		controller.abort();
		return Response.json({ status: "delivered" });
	};
	await assert.rejects(
		connectBrowserSession("fake-flow", "fake-session", controller.signal),
		/Canceled/,
	);
});
