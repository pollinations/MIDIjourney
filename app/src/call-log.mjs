import { parseAgentResponse, redactSecrets } from "../.generated/midi-core.mjs";
import { providerErrorDetails } from "./provider-error.mjs";
import { captureReply } from "./response-diagnostics.mjs";

export const MAX_CALLS = 30;
const MAX_NOTE_PREVIEW = 128;
const safeText = (value, limit = 160) =>
	typeof value === "string" ? redactSecrets(value).slice(0, limit) : null;
const count = (value) =>
	Number.isSafeInteger(value) && value >= 0 ? value : null;

export function reportedUsage(usage) {
	return {
		input: count(usage?.prompt_tokens),
		output: count(usage?.completion_tokens),
		total: count(usage?.total_tokens),
		cached: count(usage?.prompt_tokens_details?.cached_tokens),
		reasoning: count(usage?.completion_tokens_details?.reasoning_tokens),
	};
}

function outputDetails(response) {
	try {
		const reply = parseAgentResponse(response?.choices?.[0]?.message?.content, {
			finishReason: response?.choices?.[0]?.finish_reason,
		});
		const clip = reply.midi;
		if (!clip)
			return {
				validation: reply.midiWarning
					? "Invalid MIDI — output rejected"
					: "Chat reply — no MIDI",
				toolCount: reply.toolCount,
			};
		const pitches = clip.notes.map((note) => note.pitch);
		return {
			validation: "Valid MIDI",
			title: safeText(clip.title),
			key: safeText(clip.key),
			duration: clip.duration,
			noteCount: clip.notes.length,
			pitchRange: pitches.length
				? [Math.min(...pitches), Math.max(...pitches)]
				: null,
			notes: clip.notes.slice(0, MAX_NOTE_PREVIEW),
			omittedNotes: Math.max(0, clip.notes.length - MAX_NOTE_PREVIEW),
		};
	} catch {
		// Validation summary is separate from the bounded, copy-only model reply.
		return { validation: "Invalid MIDI — output rejected" };
	}
}

export function upsertCall(entries, entry) {
	const found = entries.some((item) => item.id === entry.id);
	return (
		found
			? entries.map((item) => (item.id === entry.id ? entry : item))
			: [...entries, entry]
	).slice(-MAX_CALLS);
}

/** Observe each SDK chat attempt, including retries. Never log keys, headers,
 * prompts, account requests or arbitrary response fields. Return the original
 * response/error unchanged so diagnostics cannot change generation behavior. */
export function observeChat(client, onEntry, nextId) {
	return {
		async chat(messages, options) {
			const started = Date.now();
			const base = {
				id: nextId(),
				startedAt: new Date(started).toISOString(),
				requestedModel: safeText(options?.model),
				model: null,
				status: "Pending",
				durationMs: 0,
				messageCount: Array.isArray(messages) ? messages.length : 0,
				finishReason: null,
				usage: reportedUsage(null),
			};
			let finished = false;
			const emit = (entry) => {
				try {
					onEntry(entry);
				} catch {
					/* Diagnostic only. */
				}
			};
			const finish = (details) => {
				if (finished) return;
				finished = true;
				emit({ ...base, ...details, durationMs: Date.now() - started });
			};
			const abort = () => finish({ status: "Canceled" });
			emit(base);
			options?.signal?.addEventListener("abort", abort, { once: true });
			if (options?.signal?.aborted) abort();
			try {
				const response = await client.chat(messages, options);
				finish({
					status: "Received",
					responseId: safeText(response?.id),
					model: safeText(response?.model),
					finishReason: safeText(response?.choices?.[0]?.finish_reason),
					usage: reportedUsage(response?.usage),
					output: outputDetails(response),
					reply: captureReply(response?.choices?.[0]?.message?.content),
				});
				return response;
			} catch (error) {
				finish({
					status:
						error?.name === "AbortError" || error?.code === "CANCELED"
							? "Canceled"
							: "Failed",
					error: providerErrorDetails(error, client, messages),
				});
				throw error;
			} finally {
				options?.signal?.removeEventListener("abort", abort);
			}
		},
	};
}
