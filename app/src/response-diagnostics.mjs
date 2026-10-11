import { redactSecrets } from "../.generated/midi-core.mjs";

export const MAX_REPLY_CHARS = 512_000;

// Retain only the actual message: no headers, auth state or request bodies.
export function captureReply(value) {
	if (typeof value !== "string") return { text: null, status: "not retained" };
	if (value.length > MAX_REPLY_CHARS)
		return { text: null, status: "too large to retain" };
	const text = redactSecrets(value);
	return {
		text,
		status: text === value ? "original" : "credential-like text redacted",
	};
}
