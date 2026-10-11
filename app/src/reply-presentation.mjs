export function clipCreationUnavailable(live) {
	if (live.checking) return "Checking Live…";
	if (live.connected) return undefined;
	if (!live.error || live.error.startsWith("Select "))
		return "Please select a clip.";
	return live.error;
}
