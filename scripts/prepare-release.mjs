import { mkdtemp, mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { ROOT, RUNTIME_FILES, MEDIA_FILES, verifyBuild } from "./release-lib.mjs";

const dist = resolve(ROOT, "dist");
const manifest = await verifyBuild(dist, { requireConfigured: true });
// Always create a new isolated project. Never overwrite an editor's work.
const stage = await mkdtemp(join(tmpdir(), "midi-journey-release-"));
const code = resolve(stage, "code");
const patchers = resolve(stage, "patchers");
const media = resolve(stage, "media");
await Promise.all([mkdir(code), mkdir(patchers), mkdir(media)]);
for (const name of RUNTIME_FILES) await copyFile(resolve(dist, name), resolve(code, name));
for (const name of MEDIA_FILES) await copyFile(resolve(dist, name), resolve(media, name));
const project = {
  name: "Midi Journey 2", version: 1, autoorganize: 0, autolocalize: 0,
  hideprojectwindow: 0, showdependencies: 1,
  contents: {
    patchers: { "Midi Journey 2.maxpat": {kind: "maxforlive", local: 1, toplevel: 1} },
    code: Object.fromEntries(RUNTIME_FILES.map(name => [name, {kind: "javascript", local: 1}])),
    media: Object.fromEntries(MEDIA_FILES.map(name => [name, {kind: "image", local: 1}])),
  },
  searchpath: {
    0: {bootpath: code, projectrelativepath: "./code", label: "Midi Journey 2 runtime", recursive: 0, enabled: 1, includeincollective: 1},
    1: {bootpath: patchers, projectrelativepath: "./patchers", label: "Midi Journey 2 patcher", recursive: 0, enabled: 1, includeincollective: 1},
    2: {bootpath: media, projectrelativepath: "./media", label: "Midi Journey 2 artwork", recursive: 0, enabled: 1, includeincollective: 1},
  },
  amxdtype: 0x61616161, readonly: 0, devpathtype: 0, devpath: ".", includepackages: 0,
};
const document = JSON.parse(await readFile(resolve(dist, "Midi Journey 2.maxpat"), "utf8"));
document.patcher.project = project;
document.patcher.dependency_cache = [
  ...RUNTIME_FILES.map(name => ({name, bootpath: code, patcherrelativepath: "./code", type: "TEXT", implicit: 1})),
  ...MEDIA_FILES.map(name => ({name, bootpath: media, patcherrelativepath: "./media", type: "PNG ", implicit: 1})),
];
await writeFile(resolve(patchers, "Midi Journey 2.maxpat"), JSON.stringify(document, null, 2));
await writeFile(resolve(stage, "Midi Journey 2.maxproj"), JSON.stringify(project, null, 2));
const header = (await readFile(resolve(dist, "Midi Journey 2.source.amxd"))).subarray(0, 32);
const body = Buffer.from(`${JSON.stringify(document)}\n\0`);
header.writeUInt32LE(body.length, 28);
await writeFile(resolve(stage, "Midi Journey 2.amxd"), Buffer.concat([header, body]));
await writeFile(resolve(stage, "build-manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`Prepared ${stage}\nLoad Midi Journey 2.amxd on Main, edit it in Max, Freeze Device, then save.\nThis is a source candidate, NOT a frozen release yet.`);
