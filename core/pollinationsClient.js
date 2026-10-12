const { PollinationsError } = require("@pollinations/sdk");
const { CONFIG } = require("./config.js");
const { MidiValidationError } = require("./encoding/midiClip.js");
const { parseAgentResponse } = require("./agentResponse.js");
const { tryExactTransform } = require("./exactTransform.js");
const { appendHistory, buildContext, buildRequest } = require("./history.js");
const { stripSensitiveFields } = require("./sanitize.js");

function generationAbortError() {
	return Object.assign(new Error("Generation canceled."), {
		code: "CANCELED",
		name: "AbortError",
	});
}

function raceWithAbort(promise, signal) {
	if (!signal) return promise;
	if (signal.aborted) return Promise.reject(generationAbortError());

	return new Promise((resolve, reject) => {
		const abort = () => reject(generationAbortError());
		signal.addEventListener("abort", abort, { once: true });
		Promise.resolve(promise).then(
			(value) => {
				signal.removeEventListener("abort", abort);
				resolve(value);
			},
			(error) => {
				signal.removeEventListener("abort", abort);
				reject(error);
			},
		);
	});
}

function classifyGenerationError(error) {
	if (error?.name === "AbortError" || error?.code === "CANCELED") {
		return { code: "CANCELED", message: "Generation canceled." };
	}
	if (error instanceof MidiValidationError) {
		return { code: error.code, message: error.message, details: error.details };
	}
	if (error instanceof PollinationsError) {
		if (error.status === 401) {
			return {
				code: "AUTHORIZATION_REQUIRED",
				message: "Reconnect to Pollinations.",
			};
		}
		if (error.status === 402) {
			return {
				code: "INSUFFICIENT_POLLEN",
				message: "Your Pollinations balance is too low.",
			};
		}
		if (error.status === 429) {
			return {
				code: "RATE_LIMITED",
				message: "Pollinations is busy. Please try again shortly.",
			};
		}
		if (error.status === 400 || error.status === 404) {
			return {
				code: "INVALID_PROVIDER_REQUEST",
				message: `Pollinations rejected the MIDI Journey agent request (HTTP ${error.status}).`,
			};
		}
		if (error.status === 403) {
			return {
				code: "PERMISSION_DENIED",
				message:
					"This Pollinations connection is not authorized to generate MIDI.",
			};
		}
		if (error.status === 408) {
			return {
				code: "PROVIDER_TIMEOUT",
				message: "Pollinations took too long to respond.",
			};
		}
		if (error.status >= 500) {
			return {
				code: "PROVIDER_UNAVAILABLE",
				message: "Pollinations is temporarily unavailable.",
			};
		}
		return {
			code: error.code || "POLLINATIONS_ERROR",
			message: "Pollinations could not generate MIDI.",
		};
	}
	return {
		code: error?.code || "GENERATION_ERROR",
		message: error?.message || "MIDI generation failed.",
	};
}

function normalizeTemperature(value) {
	const number = Number(value);
	if (!Number.isFinite(number)) return CONFIG.defaultTemperature;
	return Math.min(Math.max(number, 0), 2);
}

class PollinationsMidiClient {
	constructor({ auth, onEvent = () => {} } = {}) {
		if (!auth)
			throw new Error("PollinationsMidiClient requires an auth manager.");
		this.auth = auth;
		this.onEvent = onEvent;
		this.abortController = null;
	}

	async generate(input) {
		this.cancel();
		const abortController = new AbortController();
		this.abortController = abortController;
		const startedAt = Date.now();

		try {
			const safeInput = stripSensitiveFields(input);
			const request = buildRequest(safeInput);
			const local = tryExactTransform(request, safeInput);
			if (local) {
				this.clearCurrentOperation(abortController);
				return {
					...local.midi,
					text: local.text,
					midiWarning: "",
					history: appendHistory(
						safeInput.history,
						request,
						local.midi,
						local.text,
					),
				};
			}
			const client = this.auth.requireClient();
			const messages = [
				// Managed agents reject structured response formats. MIDI is optional
				// in a chat reply and is validated separately from prose/tool traces.
				...buildContext(safeInput.history, Boolean(safeInput.historyStatus)),
				{ role: "user", content: JSON.stringify(request) },
			];
			// Always call the managed MIDI Journey agent; model preferences in the
			// prompt are interpreted by the agent.
			const model = CONFIG.defaultModel;
			const temperature = normalizeTemperature(safeInput.temperature);
			this.onEvent({ type: "generation_started", model });

			// One paid agent request per Send. An error can arrive after upstream
			// work was billed, so retrying automatically risks duplicate spending.
			const response = await raceWithAbort(
				client.chat(messages, {
					model,
					temperature,
					maxTokens: 12000,
					signal: abortController.signal,
				}),
				abortController.signal,
			);

			if (
				abortController.signal.aborted ||
				this.abortController !== abortController
			) {
				throw Object.assign(new Error("Generation canceled."), {
					name: "AbortError",
				});
			}

			const content = response?.choices?.[0]?.message?.content;
			const reply = parseAgentResponse(content, {
				finishReason: response?.choices?.[0]?.finish_reason,
			});
			const result = {
				// Never return source notes as if they were generated output.
				...reply.midi,
				text: reply.text,
				midiWarning: reply.midiWarning,
				history: appendHistory(
					safeInput.history,
					request,
					reply.midi,
					reply.text,
				),
			};
			this.onEvent({
				type: "generation_completed",
				model: response.model || model,
				durationMs: Date.now() - startedAt,
				usage: response.usage || null,
			});
			this.clearCurrentOperation(abortController);
			return result;
		} catch (error) {
			const wasCurrentOperation = this.abortController === abortController;
			this.clearCurrentOperation(abortController);
			// A superseded request is canceled regardless of the provider error
			// that happens to arrive later. Otherwise an old 401 can invalidate the
			// authorization used by a newer request and surface a stale error in UI.
			const safeError =
				abortController.signal.aborted || !wasCurrentOperation
					? { code: "CANCELED", message: "Generation canceled." }
					: classifyGenerationError(error);
			if (safeError.code === "AUTHORIZATION_REQUIRED" && wasCurrentOperation) {
				await this.invalidateAuthorization(safeError);
			}
			this.onEvent({ type: "generation_failed", error: safeError });
			throw Object.assign(new Error(safeError.message), safeError);
		}
	}

	clearCurrentOperation(abortController) {
		if (this.abortController === abortController) this.abortController = null;
	}

	async invalidateAuthorization(error) {
		try {
			if (typeof this.auth.invalidate === "function") {
				await this.auth.invalidate(error);
			} else if (typeof this.auth.disconnect === "function") {
				await this.auth.disconnect();
			}
		} catch {
			// Keep the original authorization error actionable even if local
			// credential cleanup fails; the auth manager reports its own safe state.
		}
	}

	cancel() {
		const abortController = this.abortController;
		if (!abortController) return;
		abortController.abort();
		this.clearCurrentOperation(abortController);
	}

	async models() {
		const client = this.auth.requireClient();
		const models = await client.textModels();
		return models.map((model) => ({
			name: model.name,
			description: model.description || "",
			tier: model.tier || null,
			contextLength: model.context_length || null,
			supportsSystemMessages: model.supportsSystemMessages !== false,
		}));
	}
}

exports.PollinationsMidiClient = PollinationsMidiClient;
exports.classifyGenerationError = classifyGenerationError;
exports.normalizeTemperature = normalizeTemperature;
exports.raceWithAbort = raceWithAbort;
