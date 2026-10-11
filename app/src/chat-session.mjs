import {
	redactSecrets,
	supportsExactSource,
} from "../.generated/midi-core.mjs";
import { upsertCall } from "./call-log.mjs";
import {
	MAX_SOURCE_CLIPS,
	midiInputKey,
	resolveMidiInputs,
	snapshotMidiInput,
} from "./midi-input.mjs";
// One active conversation, no archive. Explicit dependencies allow tests without
// charging Pollen or touching a Live Set.
export function createChatSession({
	initial,
	createGenerator,
	readContext,
	writeClip,
	save = (_state) => true,
}) {
	let state = {
		...initial,
		busyId: null,
		sendingId: null,
	};
	const listeners = new Set();
	let epoch = 0,
		sequence = 0,
		active = null,
		disposed = false;
	const prefix =
		Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
	const emit = (change) => {
		if (disposed) return;
		state = { ...state, ...change };
		save(state);
		for (const listener of listeners) listener();
	};
	const updateTurn = (id, change) =>
		emit({
			turns: state.turns.map((turn) =>
				turn.id === id ? { ...turn, ...change } : turn,
			),
		});
	const safeError = (failure) =>
		redactSecrets(
			failure instanceof Error ? failure.message : "MIDI generation failed.",
		);
	function cancel() {
		if (!active) return;
		const current = active;
		epoch++;
		active = null;
		current.generator?.cancel();
		updateTurn(current.id, {
			status: "canceled",
			error: "Generation canceled.",
		});
		emit({ busyId: null });
	}
	return {
		activate() {
			disposed = false;
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		getSnapshot: () => state,
		setDraft(draft) {
			emit({ draft });
		},
		cancel,
		newChat() {
			// A dispatched Live mutation cannot be canceled. Wait for its receipt.
			if (state.sendingId) return false;
			cancel();
			epoch++;
			emit({
				draft: "",
				turns: [],
				context: [],
				busyId: null,
			});
			return true;
		},
		async generate() {
			if (disposed || active || state.sendingId || !state.draft.trim()) return;
			const id = `${prefix}-${++sequence}`,
				requestEpoch = ++epoch;
			const prompt = redactSecrets(state.draft.trim());
			const request = { id, generator: null };
			active = request;
			const current = () =>
				!disposed && epoch === requestEpoch && active === request;
			emit({
				draft: "",
				busyId: id,
				turns: [
					...state.turns,
					{ id, prompt, status: "pending", calls: [] },
				].slice(-30),
			});
			try {
				// Composing does not need a destination; writing always does.
				const live = await readContext();
				if (!current()) return;
				const { items } = resolveMidiInputs(live);
				if (items.length > MAX_SOURCE_CLIPS)
					throw new Error(
						`Select up to ${MAX_SOURCE_CLIPS} MIDI clips per message.`,
					);
				const sources = items.map((item) =>
					snapshotMidiInput(item.key, item.source, item.summary),
				);
				const source = sources[0]?.source;
				const sourceTarget =
					items.some((item) => item.key === midiInputKey(live)) && live.source
						? live.sourceId ||
							(live.target || "").split(":").slice(0, 3).join(":")
						: "";
				updateTurn(id, {
					sourceTarget,
					basedOn: sources.map((item) => item.source.title).join(" · "),
				});
				const generator = createGenerator((entry) => {
					if (!current()) return;
					const turn = state.turns.find((item) => item.id === id);
					if (turn) updateTurn(id, { calls: upsertCall(turn.calls, entry) });
				});
				request.generator = generator;
				// A receipt from the fresh Send-time read, not the changing UI preview.
				const inputs = sources.map((item) => ({
					...item.summary,
					noteCount: item.source.notes.length,
				}));
				updateTurn(id, {
					inputs,
					input:
						inputs.length <= 1
							? inputs[0] || { kind: "none", title: "", noteCount: 0 }
							: undefined,
				});
				const next = await generator.generate({
					promptText: prompt,
					duration: source?.duration || 8,
					history: state.context,
					historyStatus: true,
					notes: source?.notes || [],
					title: source?.title || "",
					key: source?.key || null,
					exactTransformUnsafe: items.some(
						(item) => !supportsExactSource(item.source),
					),
					...(sources.length > 1
						? { sourceClips: sources.map((item) => item.source) }
						: {}),
				});
				if (!current()) return;
				const { history, text = "", midiWarning = "", ...result } = next;
				const clip = result.notes
					? {
							title: result.title,
							explanation: result.explanation,
							key: result.key,
							duration: result.duration,
							notes: result.notes,
						}
					: undefined;
				updateTurn(id, { status: "complete", result: clip, text, midiWarning });
				emit({ context: history || [] });
			} catch (failure) {
				if (current())
					updateTurn(id, { status: "failed", error: safeError(failure) });
			} finally {
				if (current()) {
					active = null;
					emit({ busyId: null });
				}
			}
		},
		async send(id, live) {
			if (
				disposed ||
				active ||
				state.sendingId ||
				!live.connected ||
				!live.target
			)
				return;
			const turn = state.turns.find((item) => item.id === id);
			if (!turn?.result) return;
			emit({ sendingId: id });
			updateTurn(id, { notice: "", writeError: "" });
			try {
				const ack = await writeClip(turn.result, live.target);
				updateTurn(id, {
					notice: `Created ${ack.noteCount} notes in ${ack.destination}.`,
				});
			} catch (failure) {
				updateTurn(id, { writeError: safeError(failure) });
			} finally {
				emit({ sendingId: null });
			}
		},
		dispose() {
			cancel();
			epoch++;
			disposed = true;
			listeners.clear();
		},
	};
}
