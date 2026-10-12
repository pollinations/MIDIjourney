import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	copyFile,
	mkdir,
	readdir,
	readFile,
	writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { parse } from "acorn";
import { build } from "esbuild";
import { build as viteBuild } from "vite";
import { buildNative } from "./build-native.mjs";
import { makeDevice } from "./device.mjs";
import { BUILD_FILES } from "./release-lib.mjs";
import { sourceFingerprint } from "./source-fingerprint.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { version } = require("../package.json");
const { CONFIG, hasConfiguredAppKey } = require("../core/config.js");
const dist = resolve(root, "dist");
await mkdir(dist, { recursive: true });
await buildNative(dist);
// Max js uses ES5, even though the browser and Node runtimes support modern JS.
for (const name of ["bridge", "window", "panel"]) {
	const file = resolve(root, `device/${name}.js`);
	try {
		parse(await readFile(file, "utf8"), { ecmaVersion: 5 });
	} catch (error) {
		throw new Error(`Max cannot load ${name}.js: ${error.message}`);
	}
}
execFileSync(process.execPath, [resolve(root, "scripts/build-core.mjs")], {
	stdio: "inherit",
});
execFileSync(
	resolve(root, "node_modules/.bin/tsc"),
	["--noEmit", "-p", resolve(root, "app/tsconfig.json")],
	{ stdio: "inherit" },
);
await viteBuild({
	root: resolve(root, "app"),
	configFile: false,
	base: "./",
	plugins: [react(), tailwindcss()],
	resolve: {
		dedupe: ["react", "react-dom", "@pollinations/sdk"],
		alias: [
			{
				find: /^@pollinations\/sdk$/,
				replacement: resolve(
					dirname(require.resolve("@pollinations/sdk/package.json")),
					"dist/index.js",
				),
			},
		],
	},
	define: {
		__MIDIJOURNEY_APP_KEY__: JSON.stringify(
			hasConfiguredAppKey() ? CONFIG.appKey : "",
		),
	},
	build: {
		outDir: resolve(dist, "ui"),
		emptyOutDir: true,
		target: "chrome135",
	},
});
const assets = {};
async function collect(directory, prefix = "") {
	for (const entry of (await readdir(directory, { withFileTypes: true })).sort(
		(a, b) => a.name.localeCompare(b.name),
	)) {
		const name = `${prefix}${entry.name}`;
		if (entry.isDirectory())
			await collect(resolve(directory, entry.name), `${name}/`);
		else if (entry.isFile())
			assets[name] = (await readFile(resolve(directory, entry.name))).toString(
				"base64",
			);
		else throw new Error("UI assets must be regular files.");
	}
}
await collect(resolve(dist, "ui"));
await build({
	entryPoints: [resolve(root, "device/server.mjs")],
	outfile: resolve(dist, "midijourney-server.js"),
	bundle: true,
	platform: "node",
	format: "cjs",
	target: "node20",
	external: ["max-api"],
	plugins: [
		{
			name: "embedded-ui",
			setup(builder) {
				builder.onResolve({ filter: /^#ui-assets$/ }, () => ({
					path: "ui-assets",
					namespace: "embedded",
				}));
				builder.onLoad({ filter: /.*/, namespace: "embedded" }, () => ({
					contents: `export default ${JSON.stringify(assets)};`,
					loader: "js",
				}));
			},
		},
	],
});
for (const file of ["bridge", "window", "panel"])
	await copyFile(
		resolve(root, `device/${file}.js`),
		resolve(dist, `midijourney-${file}.js`),
	);
const patch = makeDevice();
await writeFile(
	resolve(dist, "MIDI Journey 2.maxpat"),
	JSON.stringify(patch, null, 2),
);
const body = Buffer.from(`${JSON.stringify(patch)}\n\0`);
const header = Buffer.alloc(32);
header.write("ampf", 0);
header.writeUInt32LE(4, 4);
header.write("aaaa", 8);
header.write("meta", 12);
header.writeUInt32LE(4, 16);
header.writeUInt32LE(1, 20);
header.write("ptch", 24);
header.writeUInt32LE(body.length, 28);
await writeFile(
	resolve(dist, "MIDI Journey 2.source.amxd"),
	Buffer.concat([header, body]),
);
const hashes = {};
for (const name of BUILD_FILES)
	hashes[name] = createHash("sha256")
		.update(await readFile(resolve(dist, name)))
		.digest("hex");
await writeFile(
	resolve(dist, "build-manifest.json"),
	JSON.stringify(
		{
			format: "midi-journey-build-v1",
			version,
			configured: hasConfiguredAppKey(),
			agentBaseUrl: CONFIG.agentBaseUrl,
			agentModel: CONFIG.defaultModel,
			source: await sourceFingerprint(
				root,
				hasConfiguredAppKey() ? CONFIG.appKey : "",
			),
			files: hashes,
		},
		null,
		2,
	),
);
console.log(
	"Built MIDI Journey 2 source device with embedded web assets. Native Max freeze is still required.",
);
