const { AGENT_CONFIG } = require("./agentConfig.js");
const APP_KEY_PLACEHOLDER = "pk_REPLACE_WITH_MIDIJOURNEY_APP_KEY";

let embeddedAppKey = "";
try {
	// Keep the existing ignored local configuration unchanged.
	({ appKey: embeddedAppKey } = require("../js/config.release.js"));
} catch (error) {
	if (error.code !== "MODULE_NOT_FOUND") throw error;
}

const POLLINATIONS_APP_KEY =
	process.env.MIDIJOURNEY_POLLINATIONS_APP_KEY?.trim() ||
	String(embeddedAppKey || "").trim() ||
	APP_KEY_PLACEHOLDER;

const CONFIG = Object.freeze({
	appKey: POLLINATIONS_APP_KEY,
	appKeyPlaceholder: APP_KEY_PLACEHOLDER,
	authScope: "generate profile usage",
	// The managed agent, not the similarly named legacy MIDI models or its base model.
	...AGENT_CONFIG,
	defaultTemperature: 0.7,
	maxContextCharacters: 100000,
	maxContextEntryLength: 40000,
	maxContextMessages: 12,
	maxHistoryEntryLength: 50000,
	maxHistoryMessages: 100,
	maxClipBeats: 4096,
	maxInputNotes: 2048,
	maxOutputNotes: 2048,
	maxPromptLength: 12000,
	maxTitleLength: 60,
	textTimeoutMs: 180000,
});

function hasConfiguredAppKey(appKey = CONFIG.appKey) {
	return (
		typeof appKey === "string" &&
		appKey.startsWith("pk_") &&
		appKey !== CONFIG.appKeyPlaceholder
	);
}

exports.CONFIG = CONFIG;
exports.hasConfiguredAppKey = hasConfiguredAppKey;
