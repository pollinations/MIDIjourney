import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Max caches external classes for the lifetime of Live. A changed helper needs
// a new class identity, otherwise reloading a device silently reuses old code.
const nativeRevision = createHash("sha256")
	.update(
		readFileSync(new URL("../device/native/shortcuts.m", import.meta.url)),
	)
	.update(
		readFileSync(new URL("../device/native/window-sizing.h", import.meta.url)),
	)
	.digest("hex")
	.slice(0, 12);
export const NATIVE_NAME = `midijourney-shortcuts-${nativeRevision}`;
export const NATIVE_BUNDLE = `${NATIVE_NAME}.mxo`;
export const NATIVE_FILES = [
	`${NATIVE_BUNDLE}/Contents/Info.plist`,
	`${NATIVE_BUNDLE}/Contents/MacOS/${NATIVE_NAME}`,
	`${NATIVE_BUNDLE}/Contents/_CodeSignature/CodeResources`,
];
export async function buildNative(destination) {
	if (process.platform !== "darwin")
		throw new Error(
			"The device currently targets macOS; build its native keyboard component on macOS.",
		);
	const sdk = process.env.MAX_SDK_PATH;
	if (!sdk)
		throw new Error(
			"Set MAX_SDK_PATH to Cycling74/max-sdk-base (see device/native/README.md).",
		);
	const headers = resolve(sdk, "c74support/max-includes");
	await access(resolve(headers, "ext.h"));
	const bundle = resolve(destination, NATIVE_BUNDLE);
	await mkdir(resolve(bundle, "Contents/MacOS"), { recursive: true });
	const root = fileURLToPath(new URL("../", import.meta.url));
	execFileSync(
		"xcrun",
		[
			"clang",
			"-bundle",
			"-fblocks",
			"-fobjc-arc",
			`-DMIDIJOURNEY_SHORTCUT_CLASS="${NATIVE_NAME}"`,
			"-arch",
			"arm64",
			"-arch",
			"x86_64",
			"-mmacosx-version-min=11.0",
			"-undefined",
			"dynamic_lookup",
			"-framework",
			"Cocoa",
			"-I",
			headers,
			resolve(root, "device/native/shortcuts.m"),
			"-o",
			resolve(bundle, `Contents/MacOS/${NATIVE_NAME}`),
		],
		{ stdio: "inherit" },
	);
	await writeFile(
		resolve(bundle, "Contents/Info.plist"),
		`<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>${NATIVE_NAME}</string>
<key>CFBundleIdentifier</key><string>ai.pollinations.midijourney.shortcuts.${nativeRevision}</string>
<key>CFBundlePackageType</key><string>iLaX</string>
<key>CFBundleVersion</key><string>1</string>
</dict></plist>\n`,
	);
	// Ad-hoc signing is for local builds, not a substitute for release signing
	// and notarization. It creates no credentials or signing identities.
	execFileSync("codesign", ["--force", "--sign", "-", bundle], {
		stdio: "inherit",
	});
	execFileSync("codesign", ["--verify", "--strict", bundle], {
		stdio: "inherit",
	});
}
