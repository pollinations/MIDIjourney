import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ROOT, verifyBuild } from "./release-lib.mjs";

await verifyBuild();
const patch = await readFile(
	resolve(ROOT, "dist/Midi Journey 2.maxpat"),
	"utf8",
);
assert.doesNotMatch(
	patch,
	/\/Users\/|\/private\/|persistent\/|extension\/|node_modules\//,
	"Source patch must use relative runtime filenames",
);
const source = await readFile(
	resolve(ROOT, "dist/midijourney-server.js"),
	"utf8",
);
assert.doesNotMatch(
	source,
	/\/Users\/comsom\/|extensions-sdk|config\.release\.js/,
	"Compiled runtime must not depend on development paths",
);
const ui = JSON.parse(
	await readFile(
		resolve(ROOT, "node_modules/@pollinations/ui/package.json"),
		"utf8",
	),
);
const lock = JSON.parse(
	await readFile(resolve(ROOT, "package-lock.json"), "utf8"),
);
assert.equal(ui.version, "0.1.0-alpha.11");
assert.equal(
	lock.packages["node_modules/@pollinations/ui"].version,
	ui.version,
);
assert.match(
	lock.packages["node_modules/@pollinations/ui"].integrity,
	/^sha512-/,
);
console.log(
	"Source build, relative dependencies, and pinned published Pollinations UI verified.",
);
