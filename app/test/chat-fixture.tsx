// Test-only entry. Real App, SDK provider, generation client and Max transport;
// fake network and fake Live. No paid calls or real credentials leave this page.
import { PolliProvider } from "@pollinations/sdk/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import managedReplies from "../../core/test/fixtures/managed-agent-replies.json";
import { App } from "../src/App";
import "../src/style.css";

const signedOut =
	new URLSearchParams(location.search).get("auth") === "signed-out";
if (signedOut)
	history.replaceState(
		null,
		"",
		`${location.pathname}${location.search}#live-session=${"a".repeat(64)}`,
	);

function requiredElement(id: string) {
	const element = document.getElementById(id);
	if (!element) throw new Error(`Missing fixture element: ${id}`);
	return element;
}

let destination = 1,
	writes = 0,
	generation = 0;
let receive: (id: string, raw: string) => void;
const host = window as unknown as {
	max: {
		bindInlet: (name: string, callback: typeof receive) => void;
		outlet: (...values: string[]) => void;
	};
};
host.max = {
	bindInlet: (_name, callback) => {
		receive = callback;
	},
	outlet: (action, id, raw) => {
		if (action === "context")
			queueMicrotask(() =>
				receive(
					id,
					JSON.stringify({
						ok: true,
						context: {
							connected: true,
							target: `track-${destination}`,
							destination: `MIDI ${destination} · empty slot 1`,
							source: (
								document.getElementById("test-source") as HTMLInputElement
							)?.checked
								? {
										title: "Selected melody",
										key: "E minor",
										duration: 8,
										notes: [
											{
												pitch: 64,
												start_time: 0.125,
												duration: 1.375,
												velocity: 87,
											},
											{
												pitch: 71,
												start_time: 2.875,
												duration: 2.125,
												velocity: 64,
											},
										],
									}
								: null,
						},
					}),
				),
			);
		if (action === "create") {
			const request = JSON.parse(raw);
			const ok = request.target === `track-${destination}`;
			if (ok) {
				writes++;
				requiredElement("test-writes").textContent =
					`Writes: ${writes} · ${request.clip.title}`;
			}
			queueMicrotask(() =>
				receive(
					id,
					JSON.stringify(
						ok
							? {
									ok: true,
									noteCount: request.clip.notes.length,
									destination: `MIDI ${destination} · empty slot 1`,
								}
							: { ok: false, error: "Selection changed" },
					),
				),
			);
		}
	},
};
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, options) => {
	const url = new URL(
		typeof input === "string"
			? input
			: input instanceof URL
				? input.href
				: input.url,
		location.href,
	);
	if (
		signedOut &&
		url.origin === location.origin &&
		url.pathname.startsWith("/api/auth/")
	)
		return Response.json({
			status:
				url.pathname.endsWith("/status") &&
				new URLSearchParams(location.search).get("auth-error") === "timeout"
					? "expired"
					: "pending",
		});
	if (url.origin === location.origin) return originalFetch(input, options);
	let payload: unknown;
	if (url.origin === "https://enter.pollinations.ai")
		payload = {
			name: "Test musician",
			githubUsername: "fixture-user",
			image: null,
			tier: "spore",
			nextResetAt: null,
			balance: 5,
		};
	else if (url.origin === "https://gen.pollinations.ai") {
		const request = JSON.parse(String(options?.body || "{}"));
		requiredElement("test-context").textContent =
			`Request messages: ${request.messages?.length || 0}`;
		const n = ++generation;
		const chords =
			new URLSearchParams(location.search).get("preview") === "chords";
		if ((document.getElementById("test-delay") as HTMLInputElement).checked)
			await new Promise((resolve) => setTimeout(resolve, 3500));
		if ((document.getElementById("test-fail") as HTMLInputElement).checked)
			return new Response(
				JSON.stringify({
					error: { message: "Fixture rejected", code: "BAD_REQUEST" },
				}),
				{ status: 400 },
			);
		payload = {
			model: "fixture-serving-model-with-a-long-version-name-2026-09-14",
			usage: { prompt_tokens: 123, completion_tokens: 45, total_tokens: 168 },
			choices: [
				{
					finish_reason: "stop",
					message: {
						content: JSON.stringify({
							title: chords ? "Soft chord changes" : `Melody ${n}`,
							explanation: "A gentle phrase with a little room to breathe.",
							key: "C major",
							duration: 8,
							notes: chords
								? Array.from({ length: 12 }, (_, i) => ({
										pitch: [43, 55, 60, 64, 67, 70][i % 6] + (i >= 6 ? 2 : 0),
										start_time: i < 6 ? 0 : 4,
										duration: 3.75,
										velocity: 48 + (i % 6) * 12,
									}))
								: Array.from({ length: 16 }, (_, i) => ({
										pitch:
											[48, 60, 64, 67, 52, 62, 65, 69][i % 8] + ((n - 1) % 3),
										start_time: Math.floor(i / 2),
										duration: i % 2 ? 0.75 : 1.5,
										velocity: 65 + i * 3,
									})),
						}),
					},
				},
			],
		};
		const mode = (document.getElementById("test-response") as HTMLSelectElement)
			.value;
		const reply = (payload as { choices: { message: { content: string } }[] })
			.choices[0].message;
		if (mode === "text")
			reply.content =
				"## Syncopation\n\n- **Accent** the offbeat.\n- Leave a little space.\n\nNo MIDI is needed for this explanation.";
		if (mode === "claude")
			reply.content = managedReplies["current-claude"].content;
		if (mode === "image") reply.content = managedReplies["agent-image"].content;
		if (mode === "error")
			reply.content = managedReplies["agent-claude"].content;
		if (mode === "invalid")
			reply.content =
				"The musical idea is still readable.\n\n```json\n" +
				JSON.stringify({
					title: "Invalid",
					duration: 4,
					notes: [{ pitch: 200, start_time: 0, duration: 1, velocity: 80 }],
				}) +
				"\n```";
	} else throw new Error("Unexpected external request in test fixture");
	return new Response(JSON.stringify(payload), {
		headers: { "Content-Type": "application/json" },
	});
};
const storage = {
	getItem: (key: string) =>
		!signedOut && key.endsWith(":token") ? "not-a-real-user-key" : null,
	setItem: () => {},
	removeItem: () => {},
};
createRoot(requiredElement("root")).render(
	<StrictMode>
		<section style={{ fontSize: 11, height: 44 }} aria-label="Test controls">
			<select
				id="test-response"
				aria-label="Test response format"
				defaultValue="midi"
			>
				<option value="midi">MIDI</option>
				<option value="text">Text</option>
				<option value="claude">Claude tool trace</option>
				<option value="image">Image</option>
				<option value="error">Tool error</option>
				<option value="invalid">Invalid MIDI</option>
			</select>{" "}
			<button
				type="button"
				onClick={() => {
					destination = destination === 1 ? 2 : 1;
				}}
			>
				Switch MIDI target
			</button>{" "}
			<label>
				<input id="test-source" type="checkbox" /> Selected MIDI
			</label>{" "}
			<label>
				<input id="test-delay" type="checkbox" />
				Delay reply
			</label>{" "}
			<label>
				<input id="test-fail" type="checkbox" />
				Fail reply
			</label>{" "}
			<span id="test-writes">Writes: 0</span>{" "}
			<span id="test-context">Request messages: 0</span>
		</section>
		<div style={{ height: "calc(100dvh - 44px)" }}>
			<PolliProvider appKey="pk_fixture_application" storage={storage}>
				<App />
			</PolliProvider>
		</div>
		<style>
			{"#root > div:nth-child(2) > div { height: calc(100dvh - 44px); }"}
		</style>
	</StrictMode>,
);
