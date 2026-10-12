export const LIVE_COLOR_ROLES = [
	"background",
	"text",
	"surface",
	"controlOff",
	"textOff",
	"controlOn",
	"textOn",
	"disabled",
	"disabledText",
	"muted",
	"border",
	"focus",
	"selection",
	"selectionText",
	"scrollbar",
	"display",
	"displayText",
	"displayMuted",
	"displayLine",
	"displayShape",
	"alert",
	"success",
];

function validColor(value) {
	return (
		Array.isArray(value) &&
		value.length === 4 &&
		value.every(
			(channel) =>
				typeof channel === "number" &&
				Number.isFinite(channel) &&
				channel >= 0 &&
				channel <= 1,
		)
	);
}

// Only named numeric RGBA roles become CSS. Unknown fields cannot inject styles.
export function liveThemeProperties(mode, payload) {
	if (mode !== "light" && mode !== "dark") return null;
	let colors;
	try {
		colors = JSON.parse(payload);
	} catch {
		return null;
	}
	if (!colors || !validColor(colors.background) || !validColor(colors.text))
		return null;
	return Object.fromEntries(
		LIVE_COLOR_ROLES.map((role) => {
			const rgba = colors[role];
			return [
				`--mj-live-${role}`,
				validColor(rgba)
					? `rgb(${rgba
							.slice(0, 3)
							.map((v) => Math.round(v * 255))
							.join(" ")} / ${rgba[3]})`
					: "",
			];
		}),
	);
}
