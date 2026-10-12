import { memo } from "react";
import {
	KEY_WIDTH,
	pianoRoll,
	ROLL_HEIGHT,
	ROLL_WIDTH,
} from "./piano-roll.mjs";
import type { MidiResult } from "./types";

export const PianoRoll = memo(function PianoRoll({
	clip,
	compact = false,
}: {
	clip: MidiResult;
	compact?: boolean;
}) {
	const roll = pianoRoll(clip.notes, clip.duration);
	if (!roll) return null;
	return (
		<svg
			className="mj-piano-roll"
			style={{ height: compact ? "100%" : roll.displayHeight }}
			viewBox={`0 0 ${ROLL_WIDTH} ${ROLL_HEIGHT}`}
			preserveAspectRatio="none"
			role="img"
			aria-label={`MIDI preview: ${clip.title}. ${roll.notes.length} notes, MIDI pitches ${roll.low}–${roll.high}. Time runs left to right; higher pitches are above.`}
		>
			<g>
				{roll.rows.map((row) => (
					<g key={row.pitch}>
						<rect
							x={KEY_WIDTH}
							y={row.y}
							width={ROLL_WIDTH - KEY_WIDTH}
							height={row.height}
							className={row.black ? "mj-roll-lane-dark" : "mj-roll-lane"}
						/>
						<rect
							x={0}
							y={row.y}
							width={KEY_WIDTH - 3}
							height={row.height}
							className={row.black ? "mj-roll-key-dark" : "mj-roll-key"}
						/>
					</g>
				))}
				{roll.grid.map((x) => (
					<line
						key={x}
						x1={x}
						x2={x}
						y1={0}
						y2={ROLL_HEIGHT}
						className="mj-roll-grid"
					/>
				))}
				{roll.notes.map((note) => (
					<rect
						key={note.id}
						x={note.x}
						y={note.y}
						width={note.width}
						height={note.height}
						rx={1.5}
						ry={note.height * 0.25}
						opacity={note.opacity}
						className="mj-roll-note"
					/>
				))}
			</g>
		</svg>
	);
});
