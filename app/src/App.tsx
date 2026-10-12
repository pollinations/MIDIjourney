import { Pollinations } from "@pollinations/sdk";
import { useAuthActions, useAuthState } from "@pollinations/sdk/react";
import { Alert } from "@pollinations/ui";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
	CONFIG,
	PollinationsMidiClient,
	redactSecrets,
} from "../.generated/midi-core.mjs";
import { ChatAccount } from "./ChatAccount";
import { observeChat } from "./call-log.mjs";
import { createChatSession } from "./chat-session.mjs";
import { currentContext, isJweb, subscribeContext } from "./jweb.mjs";
import { LiveAccount } from "./LiveAccount";

import { freshChat, sendClipToLive } from "./session.mjs";
import type { CallEntry, ChatState, LiveContext } from "./types";
import { Workspace } from "./Workspace";

export function App() {
	const { apiKey, isLoggedIn, error: authError } = useAuthState();
	const { logout } = useAuthActions();
	const callId = useRef(0);
	// Keep one in-memory conversation across disconnects and reconnects.
	const auth = useRef<{ client: Pollinations | null; logout: typeof logout }>({
		client: null,
		logout,
	});
	const [connecting, setConnecting] = useState(false);
	const [connectError, setConnectError] = useState("");
	const [live, setLive] = useState<LiveContext>({
		connected: false,
		checking: true,
	});
	const [session] = useState(() => {
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
				const { client, logout } = auth.current;
				if (!client) throw new Error("Connect to Pollinations first.");
				const observed = observeChat(client, onCall, () => ++callId.current);
				return new PollinationsMidiClient({
					auth: { requireClient: () => observed, invalidate: logout },
				});
			},
		});
	});
	useEffect(() => {
		// Cancel work authorized by the previous connection without discarding
		// completed MIDI, the draft, or any pending Live-write guard.
		session.cancel();
		auth.current = {
			client: apiKey
				? new Pollinations({
						apiKey,
						baseUrl: CONFIG.agentBaseUrl,
						textTimeout: CONFIG.textTimeoutMs,
					})
				: null,
			logout,
		};
	}, [apiKey, logout, session]);
	const chat = useSyncExternalStore(
		session.subscribe,
		session.getSnapshot,
	) as ChatState;
	useEffect(() => {
		session.activate();
		return () => session.dispose();
	}, [session]);
	useEffect(() => subscribeContext(window, setLive), []);

	return (
		<div
			data-theme="live"
			className="mj-app flex h-dvh flex-col text-sm text-theme-text-base"
		>
			<Workspace
				notice={
					authError || connectError ? (
						<Alert intent="danger">
							{redactSecrets(connectError || authError?.message || "")}
						</Alert>
					) : null
				}
				chat={chat}
				live={live}
				loggedIn={isLoggedIn}
				accountControl={<ChatAccount busy={Boolean(chat.busyId)} />}
				connectControl={
					<LiveAccount
						pending={connecting}
						onPendingChange={setConnecting}
						onError={setConnectError}
					/>
				}
				onPrompt={session.setDraft}
				onGenerate={() => void session.generate()}
				onCancel={session.cancel}
				onNewChat={session.newChat}
				onSend={(id) => void session.send(id, live)}
			/>
		</div>
	);
}
