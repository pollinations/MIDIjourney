import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test(
	"native window geometry survives reopening and editing shortcuts stay inside the focused browser",
	{ skip: process.platform !== "darwin" },
	async () => {
		const dir = await mkdtemp(join(tmpdir(), "midijourney-shortcut-test-"));
		try {
			const binary = join(dir, "test");
			execFileSync("xcrun", [
				"clang",
				"-fblocks",
				"-fobjc-arc",
				"-framework",
				"Cocoa",
				fileURLToPath(new URL("./shortcuts.m", import.meta.url)),
				"-o",
				binary,
			]);
			execFileSync(binary, [], { stdio: "pipe" });
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	},
);
