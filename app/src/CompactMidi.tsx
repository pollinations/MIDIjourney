import { AudioIcon, Chip, Text } from "@pollinations/ui";
import type { ReactNode } from "react";
import { midiBadgeStyle } from "./midi-color.mjs";
import type { MidiAttachment } from "./types";

export function CompactMidi({
	children,
	busy,
}: {
	children?: ReactNode;
	busy: boolean;
}) {
	return (
		<section
			className="mj-compact-midi"
			aria-label="Latest MIDI"
			aria-busy={busy}
		>
			<div className="mj-compact-preview" data-busy={busy || undefined}>
				{children || (
					<div className="mj-empty-midi" role="img" aria-label="No MIDI yet" />
				)}
			</div>
			{busy ? (
				<span role="status" className="mj-compact-status mj-thinking-dots">
					<span />
					<span />
					<span />
					<span className="sr-only">Generating MIDI…</span>
				</span>
			) : null}
		</section>
	);
}

export function CompactInputStatus({
	items,
	checking,
}: {
	items: MidiAttachment[];
	checking?: boolean;
}) {
	const names = items.map((item) => item.summary.title || "Untitled MIDI clip");
	const label = checking
		? "Reading MIDI…"
		: names.length
			? `${names[0]}${names.length > 1 ? ` +${names.length - 1}` : ""}`
			: "No MIDI selected";
	return (
		<div
			className="mj-compact-input"
			role="status"
			aria-label="Selected MIDI clips"
		>
			<Chip
				intent="neutral"
				size="md"
				className="mj-input-summary"
				aria-label={names.length ? names.join(", ") : label}
				style={midiBadgeStyle(items[0]?.summary.color)}
			>
				<AudioIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
				<Text as="span" size="xs" weight="semibold" className="truncate">
					{label}
				</Text>
			</Chip>
		</div>
	);
}
