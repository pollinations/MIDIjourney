import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const { CONFIG } = require("../core/config.js");
// Whitelist generation settings: never bundle Node auth, the keychain, env
// access or the private release config into the reusable browser MIDI core.
const publicConfig = Object.fromEntries(
	[
		"defaultModel",
        "agentBaseUrl",
		"defaultTemperature",
		"maxContextCharacters",
		"maxContextEntryLength",
		"maxContextMessages",
		"maxHistoryEntryLength",
		"maxHistoryMessages",
		"maxClipBeats",
		"maxInputNotes",
		"maxOutputNotes",
		"maxPromptLength",
		"maxTitleLength",
		"textTimeoutMs",
	].map((key) => [key, CONFIG[key]]),
);

await build({
	stdin: {
		contents: `
      export { PollinationsMidiClient } from "../../core/pollinationsClient.js";
      export { normalizeHistory, redactSecrets, MAX_SOURCE_CLIPS } from "../../core/history.js";
      export { parseMidiClipResponse, sanitizeInputNotes } from "../../core/encoding/midiClip.js";
      export { parseAgentResponse } from "../../core/agentResponse.js";
      export { supportsExactSource } from "../../core/exactTransform.js";
      export { CONFIG } from "../../core/config.js";
    `,
		resolveDir: fileURLToPath(new URL("../app/src", import.meta.url)),
		loader: "js",
	},
	outfile: fileURLToPath(
		new URL("../app/.generated/midi-core.mjs", import.meta.url),
	),
	bundle: true,
	format: "esm",
	platform: "browser",
	target: "es2022",
	plugins: [
		{
			name: "public-generation-settings",
			setup(builder) {
				builder.onResolve({ filter: /^@pollinations\/sdk$/ }, (args) =>
					args.namespace === "sdk-esm"
						? { path: args.path, external: true }
						: { path: args.path, namespace: "sdk-esm" },
				);
				builder.onLoad({ filter: /.*/, namespace: "sdk-esm" }, () => ({
					contents: 'export { PollinationsError } from "@pollinations/sdk";',
					loader: "js",
				}));
				builder.onLoad({ filter: /[/\\]core[/\\]config\.js$/ }, () => ({
					contents: `exports.CONFIG = Object.freeze(${JSON.stringify(publicConfig)});`,
					loader: "js",
				}));
			},
		},
	],
});
