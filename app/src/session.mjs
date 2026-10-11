import {
	CONFIG,
	normalizeHistory,
	parseMidiClipResponse,
	redactSecrets,
} from "../.generated/midi-core.mjs";
import { createClip, isJweb } from "./jweb.mjs";
import { MAX_SOURCE_CLIPS, normalizeMidiInput } from "./midi-input.mjs";
import { providerErrorDetails } from "./provider-error.mjs";
import { captureReply } from "./response-diagnostics.mjs";

const text = (value, limit = 1000) =>
	typeof value === "string" ? redactSecrets(value).slice(0, limit) : "";
const count = (value) =>
	Number.isSafeInteger(value) && value >= 0 ? value : null;
function normalizeCall(call) {
	return {
		id: count(call?.id) ?? 0,
		...(call?.responseId ? { responseId: text(call.responseId, 160) } : {}),
		startedAt: text(call?.startedAt, 40),
		requestedModel: text(call?.requestedModel, 160) || null,
		model: text(call?.model, 160) || null,
		status: text(call?.status, 30),
		durationMs: count(call?.durationMs) ?? 0,
		messageCount: count(call?.messageCount) ?? 0,
		finishReason: text(call?.finishReason, 80) || null,
		...(call?.reply
			? {
					reply: {
						...captureReply(call.reply.text),
						status: text(call.reply.status, 100) || "not retained",
					},
				}
			: {}),
		usage: Object.fromEntries(
			["input", "output", "total", "cached", "reasoning"].map((key) => [
				key,
				count(call?.usage?.[key]),
			]),
		),
		...(call?.error
			? {
					error: providerErrorDetails({
						code: call.error.code,
						status: count(call.error.httpStatus),
						requestId: call.error.requestId,
						message: call.error.message,
					}),
				}
			: {}),
		...(call?.output
			? {
					output: {
						validation: text(call.output.validation, 100),
						noteCount: count(call.output.noteCount) ?? undefined,
					},
				}
			: {}),
	};
}
export function normalizeChat(value) {
	const turns = [];
	for (const [index, raw] of (Array.isArray(value?.turns)
		? value.turns.slice(-30)
		: []
	).entries()) {
		if (!raw || typeof raw.prompt !== "string") continue;
		let result;
		try {
			if (raw.result) {
				result = parseMidiClipResponse(
					JSON.stringify({
						...raw.result,
						explanation: text(raw.result.explanation, 1000),
					}),
				);
				result.title = text(result.title, CONFIG.maxTitleLength);
				result.key = text(result.key, 40) || null;
			}
		} catch {
			/* Reject invalid saved MIDI. */
		}
		turns.push({
			id: text(raw.id, 80) || `restored-${index}`,
			prompt: text(raw.prompt, CONFIG.maxPromptLength),
			status:
				result || (raw.status === "complete" && (raw.text || raw.midiWarning))
					? "complete"
					: "failed",
			result,
			text: text(raw.text, 64000),
			midiWarning: text(raw.midiWarning),
			error:
				result || (raw.status === "complete" && (raw.text || raw.midiWarning))
					? ""
					: text(raw.error) ||
						"This generation was interrupted. Send your message again.",
			basedOn: text(raw.basedOn, 240),
			sourceTarget: text(raw.sourceTarget, 120),
			input: normalizeMidiInput(raw.input),
			inputs: Array.isArray(raw.inputs)
				? raw.inputs
						.slice(0, MAX_SOURCE_CLIPS)
						.map(normalizeMidiInput)
						.filter(Boolean)
				: undefined,
			calls: (Array.isArray(raw.calls) ? raw.calls : [])
				.slice(-30)
				.map(normalizeCall),
			notice: text(raw.notice),
			writeError: text(raw.writeError),
		});
	}
	return {
		draft: text(value?.draft, CONFIG.maxPromptLength),
		turns,
		context: normalizeHistory(value?.context),
	};
}
export function freshChat() {
	return { draft: "", turns: [], context: [] };
}
export function liveMessageHandler(host) {
	return isJweb(host) ? (message) => host.max.outlet(message) : null;
}
export function sendClipToLive(host, result, target) {
	return createClip(host, result, target);
}
