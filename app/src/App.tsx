import { Pollinations } from "@pollinations/sdk";
import { useAuthActions, useAuthState } from "@pollinations/sdk/react";
import { Alert } from "@pollinations/ui";
import {
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import {
	CONFIG,
	PollinationsMidiClient,
	redactSecrets,
} from "../.generated/midi-core.mjs";
import { observeChat } from "./call-log.mjs";
import { createChatSession } from "./chat-session.mjs";
import {
	currentContext,
	isJweb,
	reportPollinationsConnection,
	subscribeContext,
} from "./jweb.mjs";
import { LiveAccount } from "./LiveAccount";
import { freshChat, sendClipToLive } from "./session.mjs";
import type { CallEntry, ChatState, LiveContext } from "./types";
import { Workspace } from "./Workspace";

export function App() {
	const { apiKey, isLoggedIn, error: authError } = useAuthState();
	const { logout } = useAuthActions();
	const callId = useRef(0);
	const [connecting, setConnecting] = useState(false);
	const [connectionError, setConnectionError] = useState("");
	const [live, setLive] = useState<LiveContext>({
		connected: false,
		checking: true,
	});
	const session = useMemo(() => {
		const client = apiKey
			? new Pollinations({
					apiKey,
					baseUrl: CONFIG.agentBaseUrl,
					textTimeout: CONFIG.textTimeoutMs,
				})
			: null;
		return createChatSession({
			initial: freshChat(),
			readContext: async () => {
				try {
					return await currentContext(window, true);
				} catch (failure) {
					// Do not silently replace an unreadable Live input with a chat reply.
					if (isJweb(window)) throw failure;
					return { connected: false };
				}
			},
			writeClip: (result: unknown, target: string) =>
				sendClipToLive(window, result, target),
			createGenerator: (onCall: (entry: CallEntry) => void) => {
				if (!client) throw new Error("Connect to Pollinations first.");
				const observed = observeChat(client, onCall, () => ++callId.current);
				return new PollinationsMidiClient({
					auth: { requireClient: () => observed, invalidate: logout },
				});
			},
		});
	}, [apiKey, logout]);
	const chat = useSyncExternalStore(
		session.subscribe,
		session.getSnapshot,
	) as ChatState;
	useEffect(() => {
		session.activate();
		return () => session.dispose();
	}, [session]);
	useEffect(() => subscribeContext(window, setLive), []);
	useEffect(
		() => reportPollinationsConnection(window, isLoggedIn && Boolean(apiKey)),
		[isLoggedIn, apiKey],
	);
	useEffect(() => {
		if (!isJweb(window)) return;
		const openExternal = (event: MouseEvent) => {
			const anchor = (event.target as Element)?.closest?.("a[href]");
			if (!anchor) return;
			const url = new URL(anchor.getAttribute("href") || "", location.href);
			if (url.origin === "https://enter.pollinations.ai") {
				event.preventDefault();
				(
					window as unknown as { max: { outlet: (message: string) => void } }
				).max.outlet("dashboard");
			}
		};
		document.addEventListener("click", openExternal, true);
		return () => document.removeEventListener("click", openExternal, true);
	}, []);
	return (
		<div
			data-theme="blue"
			className="mj-app flex h-dvh flex-col text-sm text-theme-text-base"
		>
			<Workspace
				account={
					<LiveAccount
						pending={connecting}
						onPendingChange={setConnecting}
						onError={setConnectionError}
						revision={
							chat.turns.filter((turn) => turn.status === "complete").length
						}
					/>
				}
				notice={
					connectionError || authError ? (
						<Alert intent="danger">
							{redactSecrets(connectionError || authError?.message || "")}
						</Alert>
					) : null
				}
				chat={chat}
				live={live}
				loggedIn={isLoggedIn}
				connecting={connecting}
				onPrompt={session.setDraft}
				onGenerate={() => void session.generate()}
				onCancel={session.cancel}
				onNewChat={session.newChat}
				onSend={(id) => void session.send(id, live)}
			/>
		</div>
	);
}
