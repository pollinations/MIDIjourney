import { useAuthActions, useAuthState } from "@pollinations/sdk/react";
import { BrandMark, Button } from "@pollinations/ui";
import { AppUserMenu } from "@pollinations/ui/app-user-menu/sdk";
import { useEffect, useRef } from "react";
import { authRequest, liveAuthCapability, pause } from "./live-auth.mjs";
import { liveMessageHandler } from "./session.mjs";

export function LiveAccount({
	pending,
	onPendingChange: setPending,
	onError: setError,
}: {
	pending: boolean;
	onPendingChange: (pending: boolean) => void;
	onError: (error: string) => void;
}) {
	const { isLoggedIn, isHydrated } = useAuthState();
	const { setApiKey, enterUrl } = useAuthActions();
	const active = useRef<AbortController | null>(null);
	const canceling = useRef(false);
	const capability = liveAuthCapability(window);
	useEffect(() => () => active.current?.abort(), []);
	useEffect(() => {
		if (isLoggedIn) setError("");
		else if (liveMessageHandler(window) && !capability)
			setError("Press Retry on the MIDI Journey 2 device.");
	}, [isLoggedIn, capability, setError]);

	async function connect() {
		if (active.current || !capability) return;
		const request = new AbortController();
		active.current = request;
		setPending(true);
		setError("");
		try {
			await authRequest("start", capability, { signal: request.signal });
			while (!request.signal.aborted) {
				const response = await authRequest("status", capability, {
					method: "GET",
					signal: request.signal,
				});
				if (request.signal.aborted) return;
				if (response.status === "received" && response.apiKey) {
					setApiKey(response.apiKey);
					await authRequest("finish", capability, { signal: request.signal });
					return;
				}
				if (response.status === "expired")
					throw new Error("Connection timed out. Click Connect to try again.");
				await pause(request.signal);
			}
		} catch (failure) {
			if (!request.signal.aborted)
				setError(
					failure instanceof Error ? failure.message : "Could not connect.",
				);
		} finally {
			if (active.current === request) {
				active.current = null;
				setPending(false);
			}
		}
	}

	async function cancel() {
		if (canceling.current) return;
		canceling.current = true;
		const previous = active.current;
		active.current = null;
		previous?.abort();
		// Keep Connect disabled until cancellation reaches the host: a late cancel
		// must never erase a newer connection attempt.
		setPending(true);
		try {
			if (capability) await authRequest("cancel", capability);
		} catch {
			setError(
				"Could not cancel. Close and reopen MIDI Journey 2 to reset the connection.",
			);
		} finally {
			canceling.current = false;
			setPending(false);
		}
	}

	// Remain mounted through the connection's final acknowledgement.
	if (isLoggedIn) return null;
	if (!liveMessageHandler(window))
		return (
			<div>
				<AppUserMenu dashboardHref={`${enterUrl}/pollen`} />
			</div>
		);
	return (
		<div className="mj-chat-connect">
			<Button
				type="button"
				size="md"
				intent={pending ? "neutral" : "brand"}
				className={`mj-pollinations-connect${pending ? " mj-auth-cancel" : ""}`}
				disabled={!isHydrated || !capability}
				onClick={pending ? cancel : connect}
				aria-label={pending ? "Cancel connection" : "Connect to Pollinations"}
			>
				{/* The original label reserves exactly the same size while waiting. */}
				<span className="mj-connect-label" aria-hidden={pending || undefined}>
					<BrandMark className="polli:h-5 polli:w-5 polli:shrink-0" />
					Connect
				</span>
				{pending && (
					<span className="mj-cancel-label">
						<span className="mj-auth-spinner" aria-hidden="true" />
						Cancel
					</span>
				)}
			</Button>
		</div>
	);
}
