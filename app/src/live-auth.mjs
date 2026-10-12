import { liveMessageHandler } from "./session.mjs";

export function fragmentValue(hash, name) {
	const value = new URLSearchParams(hash.slice(1)).get(name);
	return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

export function liveAuthCapability(host) {
	return liveMessageHandler(host)
		? fragmentValue(host.location.hash, "live-session")
		: null;
}

/** @param {string} action
 * @param {string} capability
 * @param {{method?: string, apiKey?: string, signal?: AbortSignal}} options */
export async function authRequest(
	action,
	capability,
	{ method = "POST", apiKey, signal } = {},
) {
	const response = await fetch(`/api/auth/${action}`, {
		method,
		signal,
		cache: "no-store",
		credentials: "omit",
		headers: {
			Authorization: `Bearer ${capability}`,
			...(method === "POST" ? { "Content-Type": "application/json" } : {}),
		},
		...(method === "POST"
			? { body: JSON.stringify(apiKey ? { apiKey } : {}) }
			: {}),
	});
	if (!response.ok)
		throw new Error(
			response.status === 403
				? "This connection expired. Click Connect again in Live."
				: "Could not connect. Keep Live open and try again.",
		);
	return response.json();
}

// Validate the live connection before starting login or handing over a session.
// Success means Live acknowledged receipt, not just that the browser sent it.
export async function connectBrowserSession(
	capability,
	apiKey,
	signal,
	authorizationReturn = false,
) {
	const status = await authRequest("browser-status", capability, {
		method: "GET",
		signal,
	});
	if (signal.aborted) throw new Error("Canceled");
	if (status.status === "delivered") return "connected";
	// Every fresh Connect goes through Pollinations authorization, even when the
	// browser still has a key from an earlier connection.
	if (!authorizationReturn || !apiKey) return "login";
	await authRequest("complete", capability, { apiKey, signal });
	while (!signal.aborted) {
		const result = await authRequest("browser-status", capability, {
			method: "GET",
			signal,
		});
		if (signal.aborted) throw new Error("Canceled");
		if (result.status === "delivered") return "connected";
		await pause(signal);
	}
	throw new Error("Canceled");
}

export function pause(signal, milliseconds = 1000) {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(new Error("Canceled"));
			return;
		}
		const abort = () => {
			clearTimeout(timer);
			reject(new Error("Canceled"));
		};
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", abort);
			resolve();
		}, milliseconds);
		signal.addEventListener("abort", abort, { once: true });
	});
}
