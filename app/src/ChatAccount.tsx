import {
	useAccountBalance,
	useAccountKey,
	useAccountProfile,
	useAuthActions,
	useAuthState,
} from "@pollinations/sdk/react";
import { AccountIcon, Button } from "@pollinations/ui";
import { useEffect } from "react";
import { pollenLabel } from "./pollen-label.mjs";

export function ChatAccount({ busy }: { busy: boolean }) {
	const { isLoggedIn } = useAuthState();
	const { enterUrl } = useAuthActions();
	const profile = useAccountProfile({ enabled: isLoggedIn });
	const key = useAccountKey({ enabled: isLoggedIn });
	// Match the SDK menu: a limited app shows its remaining budget, otherwise
	// use the wallet only when this key has permission to read it.
	const canReadWallet =
		key.data?.pollenBudget === null &&
		(key.data.permissions?.account?.includes("usage") ?? false);
	const balance = useAccountBalance({ enabled: isLoggedIn && canReadWallet });
	useEffect(() => {
		if (!isLoggedIn || busy) return;
		const refresh = () => {
			if (document.visibilityState !== "visible") return;
			void key.refresh();
			if (canReadWallet) void balance.refresh();
		};
		refresh();
		document.addEventListener("visibilitychange", refresh);
		window.addEventListener("focus", refresh);
		return () => {
			document.removeEventListener("visibilitychange", refresh);
			window.removeEventListener("focus", refresh);
		};
	}, [isLoggedIn, busy, canReadWallet, key.refresh, balance.refresh]);
	if (!isLoggedIn) return null;
	const wallet = balance.data?.accountBalance;
	const limited = key.data?.pollenBudget != null;
	const remaining = limited
		? key.data?.pollenBudget
		: canReadWallet && wallet
			? wallet.paid + wallet.tier
			: null;
	const editKey = new URL("/edit-key", enterUrl);
	// The installed alpha SDK omits id from KeyInfo's type; its UI menu uses it.
	const keyId =
		key.data && "id" in key.data && typeof key.data.id === "string"
			? key.data.id
			: null;
	if (keyId) editKey.searchParams.set("id", keyId);
	const name = profile.data?.name || profile.data?.githubUsername || "Account";
	return (
		<fieldset className="mj-chat-account" aria-label="Pollinations account">
			<Button
				as="a"
				intent="neutral"
				href={new URL("/pollen", enterUrl).href}
				target="_blank"
				rel="noopener noreferrer"
				className="mj-account-avatar"
				aria-label={`Open dashboard for ${name}`}
			>
				{profile.data?.image ? (
					<img src={profile.data.image} alt="" />
				) : (
					<AccountIcon aria-hidden="true" />
				)}
			</Button>
			<Button
				as="a"
				intent="neutral"
				href={editKey.href}
				disabled={!keyId}
				target="_blank"
				rel="noopener noreferrer"
				className="mj-account-pollen"
				aria-label={`Manage app key. ${limited ? "App budget" : "Pollinations balance"}: ${remaining == null ? "unavailable" : `${remaining} Pollen remaining`}.`}
			>
				{pollenLabel(remaining)}
			</Button>
		</fieldset>
	);
}
