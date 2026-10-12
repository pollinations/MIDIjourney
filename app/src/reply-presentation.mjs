// Destination occupancy is independent of the MIDI selected as prompt input.
export function clipWriteAction(live) {
	if (live.connected && !live.checking) {
		if (live.clipId > 0) return "Replace selected clip";
		if (live.clipId === 0) return "Write to selected empty slot";
	}
	return "Write to selected slot";
}

export function clipCreationUnavailable(live) {
	if (live.checking) return "Checking Live…";
	if (live.connected) return undefined;
	if (!live.error || live.error.startsWith("Select "))
		return "Please select a clip.";
	return live.error;
}

// Keep Live's detailed read-back diagnostics in the console, not the chat.
// This also covers errors retained by an already-open conversation.
export function clipWriteFeedback(message) {
	if (
		message.startsWith("Live did not confirm the MIDI notes.") ||
		message.startsWith("Live has not confirmed the write.")
	)
		return "Couldn't confirm the clip. Check it in Live before writing again.";
	if (message.startsWith("Live could not write the clip."))
		return "Couldn't write the clip. Check it in Live; use Undo if needed.";
	return message;
}
