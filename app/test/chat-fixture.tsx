// Test-only entry. Real App, SDK provider, generation client and Max transport;
// fake network and fake Live. No paid calls or real credentials leave this page.
import {
	PolliProvider,
	useAuthActions,
	useAuthState,
} from "@pollinations/sdk/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import managedReplies from "../../core/test/fixtures/managed-agent-replies.json";
import { App } from "../src/App";
import { BrowserConnect } from "../src/BrowserConnect";
import { DevicePanel } from "../src/DevicePanel";
import { SurfaceSession } from "../src/SurfaceSession";
import "../src/style.css";

const authMode = new URLSearchParams(location.search).get("auth");
const signedOut = authMode === "signed-out" || authMode === "connect-success";
const browserConnect =
	new URLSearchParams(location.search).get("surface") === "connect" ||
	new URLSearchParams(location.search).has("code");
const hideControls =
	browserConnect ||
	new URLSearchParams(location.search).get("surface") === "device" ||
	new URLSearchParams(location.search).get("view") === "clean";
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

function HydratedBrowserConnect() {
	const { isHydrated } = useAuthState();
	return isHydrated ? <BrowserConnect capability={"b".repeat(64)} /> : null;
}

function TestAccountConnection() {
	const { isLoggedIn } = useAuthState();
	const { logout } = useAuthActions();
	if (hideControls || !isLoggedIn) return null;
	return (
		<button
			type="button"
			style={{ position: "fixed", right: 0, top: 0, zIndex: 10, fontSize: 11 }}
			onClick={logout}
		>
			Disconnect test account
		</button>
	);
}

let destination = 1,
	writes = 0,
	generation = 0;
let receive: (id: string, raw: string) => void;
let themeReceiver: (...values: unknown[]) => void;
// Simulated host roles, deliberately unlike the SDK brand palette.
function sendFixtureTheme() {
	const choice =
		(document.getElementById("test-theme") as HTMLSelectElement)?.value ||
		new URLSearchParams(location.search).get("theme") ||
		"dark";
	const light = choice === "light";
	const color = (hex: string) => [
		...(hex.match(/../g) || []).map((v) => parseInt(v, 16) / 255),
		1,
	];
	const palette = {
		background: color(light ? "e5e5e5" : "333333"),
		text: color(light ? "222222" : "dddddd"),
		surface: color(light ? "ffffff" : "252525"),
		controlOff: color(light ? "d0d0d0" : "414141"),
		textOff: color(light ? "222222" : "dddddd"),
		controlOn: color(
			choice === "teal" ? "75d8c3" : light ? "606060" : "cccccc",
		),
		textOn: color(light ? "ffffff" : "171717"),
		disabled: color(light ? "d5d5d5" : "484848"),
		disabledText: color(light ? "909090" : "858585"),
		muted: color(light ? "666666" : "a0a0a0"),
		border: color(light ? "b0b0b0" : "555555"),
		focus: color(choice === "teal" ? "75d8c3" : light ? "606060" : "cccccc"),
		selection: color(light ? "606060" : "cccccc"),
		selectionText: color(light ? "ffffff" : "171717"),
		scrollbar: color(light ? "999999" : "777777"),
		display: color(light ? "f5f5f5" : "202020"),
		displayText: color(light ? "222222" : "dddddd"),
		displayMuted: color(light ? "999999" : "555555"),
		displayLine: color(light ? "dddddd" : "303030"),
		displayShape: color(
			choice === "teal" ? "75d8c3" : light ? "505050" : "bfbfbf",
		),
		alert: color(light ? "606060" : "cccccc"),
		success: color(light ? "222222" : "dddddd"),
	};
	themeReceiver?.(light ? "light" : "dark", JSON.stringify(palette));
}
const host = window as unknown as {
	max: {
		bindInlet: (name: string, callback: (...values: unknown[]) => void) => void;
		outlet: (...values: string[]) => void;
	};
};
host.max = {
	bindInlet: (name, callback) => {
		if (name === "response") receive = (id, raw) => callback(id, raw);
		if (name === "theme") themeReceiver = callback;
	},
	outlet: (action, id, raw) => {
		if (action === "theme") queueMicrotask(sendFixtureTheme);
		if (action === "account") document.body.dataset.accountDestination = id;
		if (action === "context")
			queueMicrotask(() =>
				receive(
					id,
					JSON.stringify({
						ok: true,
						context: {
							connected: true,
							clipId: (
								document.getElementById("test-occupied") as HTMLInputElement
							)?.checked
								? 42
								: 0,
							target: `track-${destination}`,
							destination: `MIDI ${destination} · empty slot 1`,
							source: (
								document.getElementById("test-source") as HTMLInputElement
							)?.checked
								? {
										title: "Selected melody",
										color: 0xff33d8,
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
			const writeResult = (
				document.getElementById("test-write-result") as HTMLSelectElement
			)?.value;
			const writeError =
				writeResult === "mismatch"
					? "Live did not confirm the MIDI notes. Note 57 duration differs by 0.150000. Inspect the clip; no write was retried."
					: writeResult === "failure"
						? "Live could not write the clip. Fixture failure. Inspect it and use Undo if needed; no write was retried."
						: "";
			const ok = request.target === `track-${destination}` && !writeError;
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
							: { ok: false, error: writeError || "Selection changed" },
					),
				),
			);
		}
	},
};
const originalFetch = window.fetch.bind(window);
let connectionDelivered = false;
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
		(signedOut || browserConnect) &&
		url.origin === location.origin &&
		url.pathname.startsWith("/api/auth/")
	) {
		if (
			browserConnect &&
			new URLSearchParams(location.search).get("auth-error") === "expired"
		)
			return new Response("", { status: 403 });
		if (authMode === "connect-success" && url.pathname.endsWith("/status"))
			return Response.json({
				status: "received",
				apiKey: "not-a-real-user-key",
			});
		if (browserConnect && url.pathname.endsWith("/complete"))
			connectionDelivered = true;
		return Response.json({
			status: connectionDelivered
				? "delivered"
				: url.pathname.endsWith("/status") &&
						new URLSearchParams(location.search).get("auth-error") === "timeout"
					? "expired"
					: "pending",
		});
	}
	if (browserConnect && url.pathname === "/api/oauth/token")
		return Response.json({ access_token: "not-a-real-authorized-key" });
	if (url.origin === location.origin) return originalFetch(input, options);
	let payload: unknown;
	if (url.origin === "https://enter.pollinations.ai")
		payload = {
			id: "fixture-key",
			pollenBudget: 5,
			permissions: { account: ["profile", "usage"], models: ["all"] },
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
if (signedOut) localStorage.removeItem("polli:pk_fixture_application:token");
else if (!localStorage.getItem("polli:pk_fixture_application:token"))
	localStorage.setItem(
		"polli:pk_fixture_application:token",
		"not-a-real-user-key",
	);
createRoot(requiredElement("root")).render(
	<StrictMode>
		<section
			style={{
				fontSize: 11,
				height: 44,
				display: hideControls ? "none" : undefined,
			}}
			aria-label="Test controls"
		>
			<select
				id="test-theme"
				aria-label="Live theme"
				defaultValue={
					new URLSearchParams(location.search).get("theme") || "dark"
				}
				onChange={sendFixtureTheme}
			>
				<option value="dark">Dark neutral</option>
				<option value="light">Light neutral</option>
				<option value="teal">Custom teal</option>
			</select>{" "}
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
				<input id="test-occupied" type="checkbox" /> Occupied slot
			</label>{" "}
			<label>
				<input id="test-delay" type="checkbox" />
				Delay reply
			</label>{" "}
			<label>
				<input id="test-fail" type="checkbox" />
				Fail reply
			</label>{" "}
			<label>
				Write result{" "}
				<select id="test-write-result" defaultValue="ok">
					<option value="ok">Success</option>
					<option value="mismatch">Verification mismatch</option>
					<option value="failure">Write failure</option>
				</select>
			</label>{" "}
			<span id="test-writes">Writes: 0</span>{" "}
			<span id="test-context">Request messages: 0</span>
		</section>
		<div
			style={{
				height: hideControls ? "100dvh" : "calc(100dvh - 44px)",
				width:
					new URLSearchParams(location.search).get("surface") === "device"
						? 200
						: undefined,
			}}
		>
			<PolliProvider
				appKey="pk_fixture_application"
				enterUrl={browserConnect ? location.origin : undefined}
			>
				<SurfaceSession />
				<TestAccountConnection />
				{browserConnect ? (
					<HydratedBrowserConnect />
				) : new URLSearchParams(location.search).get("surface") === "device" ? (
					<DevicePanel />
				) : (
					<App />
				)}
			</PolliProvider>
		</div>
		<style>
			{`#root > div:nth-child(2) > div { height: ${hideControls ? "100dvh" : "calc(100dvh - 44px)"}; }
			.mj-device-controls { height: 169px; }`}
		</style>
	</StrictMode>,
);
