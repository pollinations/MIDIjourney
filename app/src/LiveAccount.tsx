import { useAuthActions, useAuthState } from "@pollinations/sdk/react";
import { Button } from "@pollinations/ui";
import { AppUserMenu } from "@pollinations/ui/app-user-menu/sdk";
import { useEffect, useRef } from "react";
import { authRequest, liveAuthCapability, pause } from "./live-auth.mjs";
import { liveMessageHandler } from "./session.mjs";

export function LiveAccount({
	revision,
	pending,
	onPendingChange: setPending,
	onError: setError,
}: {
	revision: number;
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
			setError("Press Retry on the Midi Journey device.");
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
				"Could not cancel. Close and reopen MIDIjourney to reset the connection.",
			);
		} finally {
			canceling.current = false;
			setPending(false);
		}
	}

	if (!liveMessageHandler(window) || isLoggedIn)
		return (
			<AppUserMenu
				key={revision}
				dashboardHref={`${enterUrl}/pollen`}
				labels={{ authorize: "Connect" }}
			/>
		);
	return (
		<div className="flex flex-col items-end gap-2">
			{pending ? (
				<Button
					size="sm"
					className="mj-auth-cancel"
					onClick={cancel}
					aria-label="Cancel connection"
				>
					<span className="mj-auth-spinner" aria-hidden="true" />
					Cancel
				</Button>
			) : (
				<Button
					size="sm"
					disabled={!isHydrated || !capability}
					onClick={connect}
				>
					Connect
				</Button>
			)}
		</div>
	);
}
