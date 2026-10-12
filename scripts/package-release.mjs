import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	access,
	copyFile,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { ROOT, sha256, verifyBuild, verifyFrozen } from "./release-lib.mjs";

const candidate = process.argv[2];
if (!candidate)
	throw new Error(
		'Usage: npm run release:package -- "/path/to/frozen/MIDI Journey 2.amxd"',
	);
const verified = await verifyFrozen(resolve(candidate));
const manifest = await verifyBuild();
const packageName = "MIDI-Journey-2";
const releaseRoot = join(ROOT, "release");
const destination = join(releaseRoot, packageName);
const zipDestination = `${destination}.zip`;
for (const path of [destination, zipDestination]) {
	try {
		await access(path);
	} catch (error) {
		if (error.code === "ENOENT") continue;
		throw error;
	}
	throw new Error(
		`Package already exists; archive it before repackaging: ${path}`,
	);
}

// Include the complete installed production dependency closure, even where
// tree shaking removes some modules. Never substitute a license name for text.
const packages = execFileSync(
	"npm",
	["ls", "--omit=dev", "--all", "--parseable"],
	{ cwd: ROOT, encoding: "utf8" },
)
	.trim()
	.split(/\r?\n/)
	.filter((path) => resolve(path) !== ROOT)
	.sort();
// Tailwind is a build dependency, but its generated CSS ships in the device.
packages.push(join(ROOT, "node_modules/tailwindcss"));
const notices = [
	"MIDI Journey 2 — third-party notices\n\nIncludes licenses and notices for the installed production dependency closure and Tailwind CSS. Some modules may be removed by bundling. Font license texts follow the software notices.\n",
];
for (const directory of packages) {
	const pkg = JSON.parse(
		await readFile(join(directory, "package.json"), "utf8"),
	);
	const files = (await readdir(directory, { withFileTypes: true }))
		.filter(
			(entry) =>
				entry.isFile() &&
				/^(license|licence|copying|notice|copyright)(\.|$)/i.test(entry.name),
		)
		.map((entry) => entry.name)
		.sort();
	notices.push(
		`\n${"=".repeat(72)}\n${pkg.name}@${pkg.version}\nDeclared license: ${pkg.license || "see license text"}\n`,
	);
	if (files.length) {
		for (const file of files)
			notices.push(
				`\n--- ${file} ---\n${await readFile(join(directory, file), "utf8")}\n`,
			);
	} else {
		assert.ok(
			["@pollinations/sdk", "@pollinations/ui"].includes(pkg.name),
			`Missing license text: ${pkg.name}`,
		);
		assert.equal(pkg.license, "MIT");
		notices.push(
			"\nUpstream repository LICENSE at 45406080a3269c144d90d63c9cb72b306910d891:\n",
		);
		notices.push(
			await readFile(join(ROOT, "vendor/POLLINATIONS-LICENSE"), "utf8"),
		);
	}
}
notices.push(
	await readFile(join(ROOT, "device/native/MAX-SDK-LICENSE"), "utf8"),
);

const fontLicenses = join(ROOT, "node_modules/@pollinations/ui/dist/licenses");
const fontFiles = (await readdir(fontLicenses))
	.filter((file) => file.endsWith(".txt"))
	.sort();
assert.ok(fontFiles.length >= 4, "Expected the shared UI font license texts");
for (const file of fontFiles)
	notices.push(
		`\n${"=".repeat(72)}\nFont license: ${file}\n\n${await readFile(join(fontLicenses, file), "utf8")}\n`,
	);

await mkdir(releaseRoot, { recursive: true });
const stage = await mkdtemp(join(releaseRoot, ".package-"));
try {
	const directory = join(stage, packageName);
	await mkdir(directory);
	await copyFile(resolve(candidate), join(directory, "MIDI Journey 2.amxd"));
	assert.equal(
		sha256(await readFile(join(directory, "MIDI Journey 2.amxd"))),
		verified.sha256,
	);
	await copyFile(join(ROOT, "LICENSE"), join(directory, "LICENSE"));
	await writeFile(join(directory, "THIRD-PARTY-NOTICES.txt"), notices.join(""));
	await writeFile(
		join(directory, "README.md"),
		`# MIDI Journey 2 V${verified.version}

Generate and transform MIDI in Ableton Live with [Pollinations.ai](https://pollinations.ai/). Connect your own account; generation uses your Pollen balance.

## Requirements

- macOS, Ableton Live 12 with Max for Live, and Max 9.1.5 or newer. The validation target is regular Live 12.4.6 with bundled Max. Windows is not validated.
- Internet access and your own Pollinations account with Pollen.
- One device instance; local port 5178 must be free.

## Install and use

1. Unzip this folder and drag **MIDI Journey 2.amxd** onto **Main** in Live.
2. Click **Open chat** in the device. The device and chat automatically follow Live's appearance.
3. Click **Connect**, authorize through Pollinations in your system browser, and return to Live. The connection completes automatically.
4. Describe a musical idea. Select a MIDI clip to include its notes as input. Your avatar opens the Pollinations dashboard; the Pollen amount opens this app's key management.
5. Select a Session MIDI clip or an empty MIDI slot, then click a generated **MIDI preview**.

**Creating replaces the selected existing clip's notes, title and length, or fills the selected empty slot.** Other clips remain unchanged. Test with disposable clips first. Recording clips and Arrangement destinations cannot be written.

All runtime scripts, web assets and fonts are embedded. No separate Node installation or source checkout is needed. Stop any development preview before loading the device.

Each new device load starts with an empty conversation and text field. No chat history, generated clips, drafts or personal login credentials are included in this download. Your own login may remain saved locally on your computer.

Hiding/reopening preserves the current conversation. Trash beside Send clears it; removing/reloading the device starts fresh. Command-C/V/X/A and Command-Z/Shift-Z provide normal text editing inside the editor. Right-click editing also remains available. The floating editor stays visible when Live loses focus. Resize the editor directly: below 520 px of content height it shows the latest MIDI and a three-line prompt; taller windows show the conversation and six prompt lines. New devices start at 420 × 550; reopening preserves size and position. Width is limited to 420–720 px. Connect or your account sits on the left above the text-only border; the clip-colored MIDI badge, Send, and Trash sit on the right. Trash shows the generated clip count and is disabled when that count is zero.

The welcome and recognized exact single-clip transpositions run locally. Other requests use your Pollinations balance and may involve agent tool calls. Paid requests are not retried automatically.

The device uses the existing hosted D1 prompt-based MIDIjourney agent and its Pollinations MCP tools.

## Privacy and troubleshooting

Send shares your message, selected MIDI notes/basic metadata, and bounded recent conversation with Pollinations and its model providers. It does not send audio or your entire Live Set. Chat stays in memory. Sign-in sessions are managed locally by the Pollinations SDK; signing out in Live and the system browser are separate actions.

For a blank editor, select bundled Max in Live's settings and restart Live. If the port is busy, close other device instances or the development preview. Connect before sending; select a Session MIDI slot before writing. After a write timeout, inspect the clip before retrying; use Live Undo if necessary.

The native macOS component is ad-hoc signed without Developer ID signing or notarization. macOS may block it after download. Do not disable Gatekeeper to load the device.

When reporting a problem, include macOS/Live/Max versions and the device checksum below. Do not include login tokens or OAuth callback URLs.

## Artifact verification

The native container, patch connections, runtime scripts and web controls match the current source build. This is byte verification, not completion of native Ableton acceptance.

- Device SHA-256: \`${verified.sha256}\`
- Build source fingerprint: \`${manifest.source}\`
- Version: ${verified.version}

Run \`shasum -a 256 -c SHA256SUMS\` inside this folder to verify every packaged file. See the GitHub release and repository release checklist for the source revision and acceptance record.

See LICENSE and THIRD-PARTY-NOTICES.txt for copyright and license notices.
`,
	);
	const files = (await readdir(directory)).sort();
	const sums = await Promise.all(
		files.map(
			async (file) =>
				`${sha256(await readFile(join(directory, file)))}  ${file}\n`,
		),
	);
	await writeFile(join(directory, "SHA256SUMS"), sums.join(""));
	const zip = join(stage, `${packageName}.zip`);
	execFileSync(
		"zip",
		[
			"-X",
			"-q",
			zip,
			...[...files, "SHA256SUMS"].map((file) => `${packageName}/${file}`),
		],
		{ cwd: stage },
	);
	execFileSync("unzip", ["-tq", zip], { stdio: "pipe" });
	await rename(directory, destination);
	await rename(zip, zipDestination);
	console.log(
		`Prepared ${zipDestination}\nDevice SHA-256: ${verified.sha256}\nZIP SHA-256: ${sha256(await readFile(zipDestination))}\nNot published; see docs/RELEASE_CHECKLIST.md for acceptance evidence.`,
	);
} finally {
	await rm(stage, { recursive: true, force: true });
}
