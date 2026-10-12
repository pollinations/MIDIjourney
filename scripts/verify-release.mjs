import { resolve } from "node:path";
import { verifyFrozen } from "./release-lib.mjs";

const file = process.argv[2];
if (!file)
	throw new Error(
		'Usage: npm run release:verify -- "/path/to/frozen/MIDI Journey.amxd"',
	);
const result = await verifyFrozen(resolve(file));
console.log(JSON.stringify(result, null, 2));
console.log(
	"Frozen bytes match this build. Native Live acceptance is a separate required check.",
);
