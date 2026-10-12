import { useAuthActions, useAuthState } from "@pollinations/sdk/react";
import { Alert, Text } from "@pollinations/ui";
import { useEffect, useRef, useState } from "react";
import { App } from "./App";
import { DevicePanel } from "./DevicePanel";
import { connectBrowserSession, fragmentValue } from "./live-auth.mjs";
import { SurfaceSession } from "./SurfaceSession";
import { liveMessageHandler } from "./session.mjs";

// Capture only the callback's presence before the SDK consumes it. The SDK
// validates state and exchanges the code; a cached browser key is not a return.
const authorizationReturn = new URLSearchParams(location.search).has("code");

export function AppEntry() {
	const { isHydrated } = useAuthState();
	// PolliProvider restores its return path after checking state/exchanging the
	// code. Inspect only after hydration; never parse or exchange OAuth ourselves.
	if (!isHydrated)
		return (
			<main className="p-6">
				<Text>Loading MIDI Journey 2…</Text>
			</main>
		);
	const capability = !liveMessageHandler(window)
		? fragmentValue(window.location.hash, "live-connect")
		: null;
	return (
		<>
			<SurfaceSession />
			{capability ? (
				<BrowserConnect capability={capability} />
			) : new URLSearchParams(location.search).get("surface") === "device" ? (
				<DevicePanel />
			) : (
				<App />
			)}
		</>
	);
}

export function BrowserConnect({ capability }: { capability: string }) {
	const { apiKey, isLoggedIn, error: authError } = useAuthState();
	const { login } = useAuthActions();
	const [connected, setConnected] = useState(false);
	const [error, setError] = useState("");
	const loginAttempted = useRef(false);

	useEffect(() => {
		if (authError) return;
		const request = new AbortController();
		// Connect in Live starts the flow. The SDK owns login and OAuth return;
		// once it supplies a session, deliver it without another confirmation page.
		void connectBrowserSession(
			capability,
			isLoggedIn ? apiKey : null,
			request.signal,
			authorizationReturn,
		)
			.then((result) => {
				if (request.signal.aborted) return;
				if (result === "connected") {
					setConnected(true);
					window.history.replaceState({}, "", "/");
					return;
				}
				if (loginAttempted.current) return;
				loginAttempted.current = true;
				login();
			})
			.catch(() => {
				if (!request.signal.aborted) {
					setError("Could not connect. Return to Live and try Connect again.");
				}
			});
		return () => request.abort();
	}, [capability, apiKey, isLoggedIn, authError, login]);

	return (
		<main className="mx-auto max-w-sm p-6">
			{authError || error ? (
				<Alert intent="danger">
					{authError
						? "Sign-in did not finish. Return to Live and try Connect again."
						: error}
				</Alert>
			) : (
				<Text role="status">
					{connected
						? "Connected. You can return to Live."
						: "Connecting to Live…"}
				</Text>
			)}
		</main>
	);
}
