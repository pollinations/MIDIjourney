// SDK links include a browser return URL. Never forward a local jweb session
// capability to the external site; open only its account destination.
export function accountDestination(raw) {
	try {
		const input = new URL(raw);
		if (input.origin === "https://pollinations.ai" && input.pathname === "/")
			return "https://pollinations.ai/";
		if (input.origin !== "https://enter.pollinations.ai") return null;
		if (!["/pollen", "/top-up", "/edit-key"].includes(input.pathname))
			return null;
		const output = new URL(input.pathname, input.origin);
		if (input.pathname === "/edit-key") {
			const id = input.searchParams.get("id");
			if (!id || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) return null;
			output.searchParams.set("id", id);
		}
		return output.href;
	} catch {
		return null;
	}
}
