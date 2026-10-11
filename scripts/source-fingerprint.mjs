import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Bind a candidate to its actual build inputs without recording local paths or
// configuration values. Test fixtures, old experiments and generated files are
// deliberately not part of the production bundle.
export async function sourceFingerprint(root, appKey) {
	const files = [
		"package.json",
		"package-lock.json",
		"app/index.html",
		"app/tsconfig.json",
		"scripts/build.mjs",
		"scripts/build-core.mjs",
		"scripts/device.mjs",
		"scripts/source-fingerprint.mjs",
	];
	async function collect(relative) {
		let entries;
		try {
			entries = await readdir(resolve(root, relative), { withFileTypes: true });
		} catch (error) {
			// The minimal UI has no public assets. Still fingerprint any added later.
			if (relative === "app/public" && error.code === "ENOENT") return;
			throw error;
		}
		for (const entry of entries) {
			if (entry.name === "test") continue;
			const name = `${relative}/${entry.name}`;
			if (entry.isDirectory()) await collect(name);
			else if (entry.isFile()) files.push(name);
			else throw new Error("Production sources must be regular files.");
		}
	}
	for (const directory of ["app/src", "app/public", "core", "device"])
		await collect(directory);
	const hash = createHash("sha256");
	for (const name of files.sort()) {
		hash.update(name).update("\0");
		hash.update(
			createHash("sha256")
				.update(await readFile(resolve(root, name)))
				.digest(),
		);
	}
	hash.update("app-identity\0").update(appKey || "");
	return hash.digest("hex");
}
