import { PianoRoll } from "./PianoRoll";
import type { MidiResult } from "./types";

export function MidiClipButton({
	clip,
	actionLabel,
	compact = false,
	sending,
	disabled,
	unavailableReason,
	onWrite,
}: {
	clip: MidiResult;
	actionLabel: string;
	compact?: boolean;
	sending: boolean;
	disabled: boolean;
	unavailableReason?: string;
	onWrite: () => void;
}) {
	const disabledReason = sending
		? "Writing MIDI to Live…"
		: unavailableReason ||
			(disabled ? "Wait for the current operation to finish." : "");
	return (
		<button
			type="button"
			className="mj-midi-write"
			data-compact={compact}
			aria-label={`${actionLabel}: ${clip.title}`}
			aria-description={disabledReason || actionLabel}
			aria-busy={sending}
			disabled={Boolean(disabledReason)}
			onClick={onWrite}
		>
			<PianoRoll clip={clip} compact={compact} />
			<span className="mj-midi-write-label" aria-hidden="true">
				{sending ? "Writing…" : actionLabel}
			</span>
		</button>
	);
}
