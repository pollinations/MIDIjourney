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
		'Usage: npm run release:package -- "/path/to/frozen/Midi Journey 2.amxd"',
	);
const verified = await verifyFrozen(resolve(candidate));
const manifest = await verifyBuild();
const packageName = "Midi-Journey-2";
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
	"Midi Journey 2 — third-party notices\n\nIncludes licenses and notices for the installed production dependency closure and Tailwind CSS. Some modules may be removed by bundling. Font license texts follow the software notices.\n",
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
	await copyFile(resolve(candidate), join(directory, "Midi Journey 2.amxd"));
	assert.equal(
		sha256(await readFile(join(directory, "Midi Journey 2.amxd"))),
		verified.sha256,
	);
	await copyFile(join(ROOT, "LICENSE"), join(directory, "LICENSE"));
	await writeFile(join(directory, "THIRD-PARTY-NOTICES.txt"), notices.join(""));
	await writeFile(
		join(directory, "README.md"),
		`# Midi Journey 2 V${verified.version}

Prepared release candidate — not published. Local acceptance is complete, with remaining manual checks confirmed by the maintainer on October 11, 2026. Publication requires separate approval.

## Requirements

- macOS, Ableton Live 12 with Max for Live, and Max 9.1.5 or newer. The validation target is regular Live 12.4.6 with bundled Max. Windows is not validated.
- Internet access and your own Pollinations account with Pollen.
- One device instance; local port 5178 must be free.

## Install and use

1. Unzip this folder and drag **Midi Journey 2.amxd** onto **Main** in Live.
2. Click its OPEN/CLOSE label to open or close the editor.
3. Click **Connect**, sign in through your system browser, confirm your account, and return to Live.
4. Describe a musical idea. Select a MIDI clip to include its notes as input.
5. Select a Session MIDI clip or an empty MIDI slot, then click **Create clip**.

**Creating replaces the selected existing clip's notes, title and length, or fills the selected empty slot.** Other clips remain unchanged. Test with disposable clips first. Recording clips and Arrangement destinations cannot be written.

All runtime scripts, web assets, fonts and artwork are embedded. No separate Node installation or source checkout is needed. Stop any development preview before loading the device.

Hiding/reopening preserves the current conversation. New chat clears it; removing/reloading the device starts fresh. Your own login may remain saved locally. Right-click provides Copy/Paste.

The welcome and recognized exact single-clip transpositions run locally. Other requests use your Pollinations balance and may involve agent tool calls. Paid requests are not retried automatically.

The device uses the existing hosted D1 prompt-based MIDIjourney agent and its Pollinations MCP tools. No code-agent upload or production routing change is required.

## Privacy and troubleshooting

Send shares your message, selected MIDI notes/basic metadata, and bounded recent conversation with Pollinations and its model providers. It does not send audio or your entire Live Set. Chat stays in memory. Sign-in sessions are managed locally by the Pollinations SDK; signing out in Live and the system browser are separate actions.

For a blank editor, select bundled Max in Live's settings and restart Live. If the port is busy, close other device instances or the development preview. Hover disabled Send/Create clip buttons for guidance. After a write timeout, inspect the clip before retrying; use Live Undo if necessary.

When reporting a problem, include macOS/Live/Max versions and the device checksum below. Do not include login tokens or OAuth callback URLs.

## Artifact verification

The native container, patch connections, runtime scripts and artwork match the current source build. This is byte verification, not completion of native Ableton acceptance.

- Device SHA-256: \`${verified.sha256}\`
- Build source fingerprint: \`${manifest.source}\`
- Version: ${verified.version}

Run \`shasum -a 256 -c SHA256SUMS\` inside this folder to verify every packaged file. The release source commit and native acceptance record must be finalized before publication.

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
