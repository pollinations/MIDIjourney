// Live exposes Clip.color as a 24-bit RGB integer. Keep missing colors neutral.
export function validMidiColor(color) {
	return Number.isInteger(color) && color >= 0 && color <= 0xffffff;
}

export function midiBadgeStyle(color) {
	if (!validMidiColor(color)) return undefined;
	const channels = [color >> 16, (color >> 8) & 255, color & 255].map(
		(value) => {
			const channel = value / 255;
			return channel <= 0.04045
				? channel / 12.92
				: ((channel + 0.055) / 1.055) ** 2.4;
		},
	);
	const luminance =
		channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
	return {
		backgroundColor: `#${color.toString(16).padStart(6, "0")}`,
		color: luminance > 0.179 ? "#000000" : "#ffffff",
	};
}
