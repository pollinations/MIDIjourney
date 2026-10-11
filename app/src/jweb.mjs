// A narrow asynchronous, request/acknowledgement bridge. Never close the window
// on send, retry a mutation, or transmit account/history data to Max.
const bridges = new WeakMap();
export function isJweb(host) {
	return (
		typeof host?.max?.outlet === "function" &&
		typeof host?.max?.bindInlet === "function"
	);
}
// Publish only a boolean; no account identity, balance or key reaches Max.
export function reportPollinationsConnection(host, connected) {
	if (!isJweb(host)) return () => {};
	const send = () =>
		host.max.outlet("pollinations", connected === true ? 1 : 0);
	send();
	// Reassert after native initialization, without an HTTP request.
	const timer = setInterval(send, 2000);
	return () => clearInterval(timer);
}
export function bridge(host) {
	if (!isJweb(host)) throw new Error("Open MIDI Journey from its Live device.");
	if (bridges.has(host)) return bridges.get(host);
	const pending = new Map();
	let sequence = 0;
	const prefix = Math.random().toString(36).slice(2);
	const receive = (id, raw) => {
		const waiting = pending.get(String(id));
		if (!waiting) return;
		pending.delete(String(id));
		clearTimeout(waiting.timer);
		try {
			const value = JSON.parse(raw);
			if (value.ok) waiting.resolve(value);
			else
				waiting.reject(
					Object.assign(
						new Error(value.error || "Live could not complete this request."),
						{ code: value.code },
					),
				);
		} catch (failure) {
			waiting.reject(failure);
		}
	};
	host.max.bindInlet("responsepart", (id, index, total, text) => {
		const waiting = pending.get(String(id));
		if (!waiting) return;
		const parts = waiting.parts || (waiting.parts = []);
		if (
			!Number.isInteger(total) ||
			total < 1 ||
			total > 2048 ||
			index !== parts.length ||
			(waiting.total && waiting.total !== total) ||
			typeof text !== "string" ||
			text.length > 4096 ||
			index >= total
		) {
			receive(
				id,
				JSON.stringify({
					ok: false,
					error: "The MIDI transfer was incomplete. Select the clip again.",
				}),
			);
			return;
		}
		waiting.total = total;
		parts.push(text);
		if (parts.length === total) receive(id, parts.join(""));
	});
	host.max.bindInlet("response", receive);
	const request = (action, ...args) =>
		new Promise((resolve, reject) => {
			const id = `${prefix}-${++sequence}`;
			const timer = setTimeout(
				() => {
					pending.delete(id);
					reject(
						Object.assign(
							new Error(
								action === "create"
									? "Live has not confirmed the write. Check the clip before trying again; it was not retried."
									: "The Live connector is not responding.",
							),
							{
								code: "LIVE_CONNECTOR_TIMEOUT",
							},
						),
					);
				},
				action === "create" ? 10000 : 2000,
			);
			pending.set(id, { resolve, reject, timer });
			try {
				if (action === "create" && args[0].length > 4096) {
					const raw = args[0].replace(
						/[\u007f-\uffff]/g,
						(c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
					);
					if (raw.length > 1000000)
						throw new Error("The MIDI clip is too large to transfer.");
					const total = Math.ceil(raw.length / 4096);
					for (let index = 0; index < total; index++)
						host.max.outlet(
							"createpart",
							id,
							index,
							total,
							raw.slice(index * 4096, (index + 1) * 4096),
						);
				} else host.max.outlet(action, id, ...args);
			} catch (failure) {
				clearTimeout(timer);
				pending.delete(id);
				reject(failure);
			}
		});
	bridges.set(host, request);
	return request;
}
export async function currentContext(host, fresh = false) {
	return (await bridge(host)("context", fresh ? 1 : 0)).context;
}
export function subscribeContext(host, onContext) {
	if (!isJweb(host)) {
		onContext({ connected: false });
		return () => {};
	}
	let stopped = false,
		timer;
	let previous = "";
	async function poll() {
		let context;
		try {
			context = await currentContext(host);
		} catch (failure) {
			context = {
				connected: false,
				error: failure.message,
				sourceError: failure.message,
			};
		}
		const next = JSON.stringify(context);
		if (!stopped) {
			if (next !== previous) {
				previous = next;
				onContext(context);
			}
			timer = setTimeout(poll, 250);
		}
	}
	void poll();
	return () => {
		stopped = true;
		clearTimeout(timer);
	};
}
export function createClip(host, result, target) {
	const clip = {
		title: result.title,
		duration: result.duration,
		notes: result.notes.map(({ pitch, start_time, duration, velocity }) => ({
			pitch,
			start_time,
			duration,
			velocity,
		})),
	};
	return bridge(host)("create", JSON.stringify({ target, clip }));
}
