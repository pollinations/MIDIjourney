import { useAuthActions, useAuthState } from "@pollinations/sdk/react";
import { setColorMode, useColorMode } from "@pollinations/ui";
import { useEffect } from "react";
import { accountDestination } from "../../device/account-links.mjs";
import { isJweb } from "./jweb.mjs";
import { liveThemeProperties } from "./live-theme.mjs";

// Both jweb surfaces use the SDK's existing same-origin session storage. No
// credentials or profile data travel through Max or a second backend.
export function SurfaceSession() {
	const { apiKey, isHydrated } = useAuthState();
	const { setApiKey } = useAuthActions();
	useColorMode(); // Subscribe the headerless chat to the shared theme store.
	useEffect(() => {
		if (!isJweb(window)) return;
		const host = window as unknown as {
			max: {
				bindInlet: (
					name: string,
					callback: (...values: unknown[]) => void,
				) => void;
				outlet: (...values: string[]) => void;
			};
		};
		let active = true;
		host.max.bindInlet("theme", (mode, payload) => {
			if (!active) return;
			const properties = liveThemeProperties(mode, payload);
			if (!properties || (mode !== "dark" && mode !== "light")) return;
			setColorMode(mode);
			const style = document.documentElement.style;
			for (const [name, value] of Object.entries(properties)) {
				if (value) style.setProperty(name, value);
				else style.removeProperty(name);
			}
		});
		host.max.outlet("theme");
		return () => {
			active = false;
		};
	}, []);
	useEffect(() => {
		if (!isHydrated) return;
		const key = `polli:${__MIDIJOURNEY_APP_KEY__}:token`;
		const sync = () => {
			const stored = localStorage.getItem(key);
			if (stored !== apiKey) setApiKey(stored);
		};
		const changed = (event: StorageEvent) => {
			if (
				event.storageArea === localStorage &&
				(event.key === key || event.key === null)
			)
				sync();
		};
		window.addEventListener("storage", changed);
		sync(); // Catch a login/logout between hydration and listener registration.
		return () => window.removeEventListener("storage", changed);
	}, [apiKey, isHydrated, setApiKey]);
	useEffect(() => {
		if (!isJweb(window)) return;
		const openExternal = (event: MouseEvent) => {
			const anchor = (event.target as Element)?.closest?.("a[href]");
			if (!anchor) return;
			const url = new URL(anchor.getAttribute("href") || "", location.href);
			if (
				url.origin === "https://enter.pollinations.ai" ||
				url.origin === "https://pollinations.ai"
			) {
				event.preventDefault();
				const destination = accountDestination(url.href);
				if (!destination) return;
				(
					window as unknown as {
						max: { outlet: (...values: string[]) => void };
					}
				).max.outlet("account", destination);
			}
		};
		document.addEventListener("click", openExternal, true);
		return () => document.removeEventListener("click", openExternal, true);
	}, []);
	return null;
}
