import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { makeDevice } from "../../scripts/device.mjs";

test("device controls open the existing editor without reloading its web page", async () => {
	const { patcher } = makeDevice();
	const boxes = new Map(patcher.boxes.map(({ box }) => [box.id, box]));
	assert.equal(patcher.devicewidth, 200);
	assert.deepEqual(boxes.get("controls").presentation_rect, [0, 0, 200, 169]);
	assert.equal(boxes.has("artwork"), false);
	assert.equal(boxes.has("auth-state"), false);
	const commands = [];
	const context = {
		outlet: (_index, command) => commands.push(command),
	};
	vm.createContext(context);
	vm.runInContext(
		await readFile(new URL("../../device/panel.js", import.meta.url), "utf8"),
		context,
	);
	context.editor("show");
	context.editor("expanded");
	context.editor("compact");
	context.editor("state");
	context.editor("invalid");
	assert.deepEqual(commands, ["open"]);
	const editor = boxes.get("window").patcher;
	assert.equal(
		editor.lines.some(
			({ patchline: line }) =>
				line.source[0] === "shortcuts" && line.destination[0] === "web",
		),
		false,
	);
	for (const source of ["defer", "controls"]) {
		assert.ok(
			patcher.lines.some(
				({ patchline: l }) =>
					l.source[0] === source && l.destination[0] === "controls-route",
			),
		);
	}
});

test("composer toolbar precedes the text-only field; explanations use compact leading", async () => {
	const workspace = await readFile(
		new URL("../src/Workspace.tsx", import.meta.url),
		"utf8",
	);
	const styles = await readFile(
		new URL("../src/style.css", import.meta.url),
		"utf8",
	);
	assert.match(
		workspace,
		/mj-composer-toolbar[\s\S]*sendButton[\s\S]*<Field.Root[^>]*mj-composer[\s\S]*<Textarea[\s\S]*<\/Field.Root>/,
	);
	assert.doesNotMatch(workspace, /PromptClipboard/);
	assert.doesNotMatch(styles, /\.mj-prompt\s*\{[^}]*padding-right:/);
	assert.match(styles, /\.mj-composer\s*\{[^}]*padding: 4px;/);
	assert.match(styles, /\.mj-round\s*\{[^}]*border-radius: 50%;/);
	assert.match(workspace, /aria-label="Send"/);
	assert.match(workspace, /<ArrowRightIcon aria-hidden="true"/);
	assert.match(styles, /\.mj-composer-toolbar\s*\{[^}]*display: flex;/);
	assert.match(styles, /\.mj-reply-explanation\s*\{[^}]*line-height: 1\.4;/);
});

test("new device has stereo pass-through and an independent modeless web window", () => {
	const { patcher } = makeDevice(resolve("dist"));
	const boxes = new Map(patcher.boxes.map(({ box }) => [box.id, box]));
	assert.equal(boxes.get("audioin").text, "plugin~");
	assert.equal(boxes.get("audioout").text, "plugout~");
	for (const channel of [0, 1]) {
		assert.ok(
			patcher.lines.some(
				({ patchline: line }) =>
					line.source[0] === "audioin" &&
					line.source[1] === channel &&
					line.destination[0] === "audioout" &&
					line.destination[1] === channel,
			),
		);
	}
	const window = boxes.get("window").patcher;
	assert.equal(window.title, "MIDI Journey 2");
	const web = window.boxes.find(({ box }) => box.id === "web").box;
	assert.equal(web.maxclass, "jweb");
	assert.equal(web.presentation, 1);
	const flags = window.boxes.find(({ box }) => box.id === "config").box.text;
	assert.match(flags, /window flags grow/);
	assert.match(flags, /window constrain 420 324 720 1400/);
	assert.match(flags, /window flags float/);
	assert.match(flags, /window size 180 80 600 630/);
	assert.deepEqual(window.rect, [180, 80, 420, 550]);
	assert.deepEqual(web.presentation_rect, [0, 0, 420, 550]);
	assert.doesNotMatch(
		JSON.stringify(patcher),
		/close_and_send|mj_bp_|mj_nodeJS/,
	);
});

test("workspace omits destination and success messages but keeps creation validation and errors", async () => {
	const workspace = await readFile(
		new URL("../src/Workspace.tsx", import.meta.url),
		"utf8",
	);
	assert.doesNotMatch(
		workspace,
		/New clip will be created in|Clip creation destination|\{live\.destination\}/,
	);
	assert.match(workspace, /clipCreationUnavailable\(live\)/);
	assert.match(workspace, /unavailableReason=\{creationUnavailable\}/);
	const footer = await readFile(
		new URL("../src/MidiClipButton.tsx", import.meta.url),
		"utf8",
	);
	assert.doesNotMatch(footer, /turn\.notice/);
	assert.match(workspace, /clipWriteFeedback\(turn\.writeError\)/);
	assert.match(footer, /unavailableReason \|\|/);
	assert.doesNotMatch(footer, /Tooltip|PlusIcon/);
	assert.match(footer, /aria-description=/);
	assert.match(footer, /<PianoRoll/);
	assert.match(footer, /disabled=\{Boolean\(disabledReason\)\}/);
	assert.doesNotMatch(
		footer,
		/Model used|Model:|replyPresentation|CopyDetails|mj-reply-meta|<Text/,
	);
});

test("conversation uses the shared scrollbar, quiet response titles, and a non-resizable blank composer", async () => {
	const workspace = await readFile(
		new URL("../src/Workspace.tsx", import.meta.url),
		"utf8",
	);
	const styles = await readFile(
		new URL("../src/style.css", import.meta.url),
		"utf8",
	);
	assert.match(workspace, /<ScrollArea\s/);
	assert.match(workspace, /ref=\{scroll\}/);
	assert.match(workspace, /onScroll=/);
	assert.doesNotMatch(
		workspace,
		/placeholder=|What would you like to change\?/,
	);
	assert.match(styles, /\.mj-prompt\s*\{[^}]*resize: none;/);
	assert.match(
		styles,
		/\.mj-composer\s*\{[^}]*border: 1px solid var\(--mj-live-muted\);/,
	);
	assert.match(styles, /\.mj-composer\s*\{[^}]*background: transparent;/);
	assert.match(
		styles,
		/\.mj-composer:focus-within\s*\{[^}]*border-color: var\(--mj-live-focus\);/,
	);
	assert.doesNotMatch(styles, /\.mj-composer:focus-within\s*\{[^}]*outline:/);
	assert.match(
		styles,
		/\.mj-reply-title\s*\{[^}]*font-family: var\(--font-body\);/,
	);
});

test("chat cards remain distinct and compact without response copy controls", async () => {
	const [workspace, styles, footer] = await Promise.all(
		["Workspace.tsx", "style.css", "MidiClipButton.tsx"].map((filename) =>
			readFile(new URL(`../src/${filename}`, import.meta.url), "utf8"),
		),
	);
	assert.match(workspace, /className="mj-user-message /);
	assert.match(workspace, /className="mj-assistant-reply /);
	assert.match(
		workspace,
		/<Surface\s+variant="card-themed"\s+className="mj-user-message polli:bg-theme-bg-active polli:text-theme-text-strong /,
	);
	assert.match(
		workspace,
		/<Surface\s+variant="card"\s+className="mj-assistant-reply /,
	);
	assert.doesNotMatch(
		styles,
		/\.mj-(?:user-message|assistant-reply)\s*\{[^}]*(?:background|color-mix)/,
	);
	assert.doesNotMatch(
		workspace + footer + styles,
		/CopyDetails|Copy response|mj-copy-details/,
	);
	assert.match(styles, /\.mj-piano-roll\s*\{[^}]*height: 112px;/);
	assert.match(
		styles,
		/\.mj-roll-note\s*\{[^}]*fill: var\(--mj-live-displayShape\)/,
	);
	assert.match(workspace, /mj-user-message [^"]*px-3 py-2/);
});

test("smaller typography uses shared tokens without scaling the layout or shrinking MIDI", async () => {
	const styles = await readFile(
		new URL("../src/style.css", import.meta.url),
		"utf8",
	);
	assert.match(styles, /--text-sm: 0\.8125rem;/);
	assert.match(styles, /--polli-text-sm: var\(--text-sm\);/);
	assert.match(styles, /--polli-text-base: 0\.9375rem;/);
	assert.match(styles, /--polli-text-2xl: 1\.375rem;/);
	assert.match(
		styles,
		/\.mj-reply-title\s*\{[^}]*font-size: var\(--polli-text-base\);/,
	);
	assert.match(styles, /\.mj-piano-roll\s*\{[^}]*height: 112px;/);
	assert.doesNotMatch(styles, /\bzoom:|transform: scale\(/);
});

test("MIDI badges are single-line and passive elements have no native tooltips", async () => {
	const components = await Promise.all(
		[
			"Workspace.tsx",
			"MidiClipButton.tsx",
			"PianoRoll.tsx",
			"MidiInputFeedback.tsx",
			"CompactMidi.tsx",
		].map((filename) =>
			readFile(new URL(`../src/${filename}`, import.meta.url), "utf8"),
		),
	);
	for (const component of components) {
		assert.doesNotMatch(component, /\stitle=|<title[\s>]|Tooltip/);
	}
	const badge = components[3].slice(
		components[3].indexOf("function MidiBadge"),
	);
	assert.match(badge, /className="min-w-0 truncate"/);
	assert.doesNotMatch(badge, /summary\.noteCount|title=/);
	assert.match(components[2], /aria-label=/);
});

test("connection guidance is accessible without hover tooltips", async () => {
	const [workspace, account, app, styles] = await Promise.all(
		["Workspace.tsx", "LiveAccount.tsx", "App.tsx", "style.css"].map((name) =>
			readFile(new URL(`../src/${name}`, import.meta.url), "utf8"),
		),
	);
	assert.doesNotMatch(
		workspace,
		/Connect to Pollinations above to send a message/,
	);
	const compactWorkspace = workspace.replace(/\s+/g, " ");
	assert.match(
		compactWorkspace,
		/loggedIn && chat.busyId \? .*: \( sendButton \)\}/,
	);
	assert.match(workspace, /\{connectControl\}/);
	assert.match(workspace, /disabled=\{\s*!loggedIn/);
	assert.doesNotMatch(account, /Finish connecting in your browser/);
	assert.match(
		account,
		/aria-label=\{pending \? "Cancel connection" : "Connect to Pollinations"\}/,
	);
	assert.match(account, /mj-auth-spinner/);
	assert.match(account, /pending,/);
	assert.match(app, /onPendingChange=\{setConnecting\}/);
	assert.match(styles, /prefers-reduced-motion: reduce/);
});

test("MIDI response cards have a comfortable maximum width without fixing their narrow-window width", async () => {
	const styles = await readFile(
		new URL("../src/style.css", import.meta.url),
		"utf8",
	);
	const reply = styles.match(/\.mj-assistant-reply\s*\{([^}]*)\}/)?.[1];
	assert.ok(reply);
	assert.match(reply, /max-width: 31\.5rem;/);
	assert.doesNotMatch(reply, /(?:^|[;\s])(?:width|min-width):/);
});

test("headerless conversation has account controls first, Reset last and chat-owned login", async () => {
	const workspace = await readFile(
		new URL("../src/Workspace.tsx", import.meta.url),
		"utf8",
	);
	const panel = await readFile(
		new URL("../src/DevicePanel.tsx", import.meta.url),
		"utf8",
	);
	assert.doesNotMatch(
		workspace,
		/<header|ColorModeToggle|New chat|\{account\}/,
	);
	assert.match(
		workspace,
		/mj-composer-toolbar[\s\S]*\{accountControl\}[\s\S]*\{connectControl\}[\s\S]*sendButton[\s\S]*Reset conversation[\s\S]*TrashIcon[\s\S]*mj-reset-count/,
	);
	assert.doesNotMatch(panel, /<LiveAccount/);
	assert.doesNotMatch(panel, /ColorModeToggle/);
	assert.doesNotMatch(panel, /Compact|Expanded/);
	assert.doesNotMatch(
		workspace,
		/WindowToggle|Expand conversation|Collapse to MIDI/,
	);
});

test("V3 uses native clipboard menus without a custom OS clipboard bridge", async () => {
	for (const filename of [
		"../../device/server.mjs",
		"../../device/bridge.js",
		"../src/Workspace.tsx",
	]) {
		const source = await readFile(new URL(filename, import.meta.url), "utf8");
		assert.doesNotMatch(
			source,
			/clipboard_read|clipboard_write|clipboard_response|onContextMenu/,
		);
	}
	const { patcher } = makeDevice(resolve("dist"));
	assert.equal(
		patcher.boxes.find(({ box }) => box.id === "route").box.text,
		"route uiurl controlsurl",
	);
	assert.ok(
		patcher.lines.some(
			({ patchline }) =>
				patchline.source[0] === "route" &&
				patchline.source[1] === 1 &&
				patchline.destination[0] === "controls-read",
		),
	);
});

test("the welcome remains before all exchanges without an API call or response controls", async () => {
	const workspace = await readFile(
		new URL("../src/Workspace.tsx", import.meta.url),
		"utf8",
	);
	const welcome = workspace
		.slice(
			workspace.indexOf("{/* Always the first bubble"),
			workspace.indexOf("chat.turns.map("),
		)
		.replace(/\s+/g, " ");
	assert.match(welcome, /className="mj-assistant-reply /);
	assert.doesNotMatch(workspace, /!chat\.turns\.length\s*\?/);
	assert.match(welcome, /aria-label="MIDI generation introduction"/);
	assert.match(welcome, /Generative MIDI clips/);
	assert.match(welcome, /<ul className="list-disc space-y-1 pl-4">/);
	assert.equal((welcome.match(/<li>/g) || []).length, 3);
	assert.match(
		welcome,
		/<strong>Select a Live clip<\/strong> to use its MIDI as input/,
	);
	assert.match(
		welcome,
		/<strong>Click a MIDI preview<\/strong> to write it to the selected slot or replace the selected clip\./,
	);
	assert.doesNotMatch(welcome, /clips stay intact/);
	assert.doesNotMatch(
		welcome,
		/🎹|Hi, I’m|ReplyFooter|CopyDetails|onGenerate|fetch\(/,
	);
	assert.doesNotMatch(
		workspace,
		/What shall we make\?|Describe a musical idea\. Then/,
	);
});

test("production chat starts fresh without browser persistence", async () => {
	const app = await readFile(
		new URL("../src/App.tsx", import.meta.url),
		"utf8",
	);
	assert.match(app, /initial: freshChat\(\)/);
	assert.doesNotMatch(
		app,
		/loadChat|saveChat|browserStorage|localStorage|sessionStorage/,
	);
});

test("header, notices, and chat share the 30-percent narrower app limit", async () => {
	const [app, workspace, styles] = await Promise.all(
		["App.tsx", "Workspace.tsx", "style.css"].map((filename) =>
			readFile(new URL(`../src/${filename}`, import.meta.url), "utf8"),
		),
	);
	assert.equal((workspace.match(/className="mj-app-width /g) || []).length, 2);
	assert.match(workspace, /<main\s+className="mj-app-width /);
	assert.doesNotMatch(app + workspace, /max-w-5xl/);
	assert.match(styles, /\.mj-app-width\s*\{\s*max-width: 44\.8rem;/);
});

test("document title keeps the app name without a visible header title", async () => {
	const [app, html] = await Promise.all([
		readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
		readFile(new URL("../index.html", import.meta.url), "utf8"),
	]);
	assert.doesNotMatch(app, /<Heading|<HeaderScene/);
	assert.match(html, /<title>MIDI Journey 2 \| pollinations\.ai<\/title>/);
});

test("production device is independent of the checkout and exposes only minimal controls", () => {
	const { patcher } = makeDevice();
	assert.doesNotMatch(
		JSON.stringify(patcher),
		/\/Users\/|persistent\/|extension\/|node_modules/,
	);
	assert.ok(
		patcher.boxes.some(
			({ box }) =>
				box.text === "node.script midijourney-server.js @autostart 1 @watch 0",
		),
	);
	assert.deepEqual(
		patcher.boxes
			.filter(({ box }) => box.presentation)
			.map(({ box }) => box.id),
		["controls"],
	);
});
