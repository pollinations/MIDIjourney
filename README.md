# Midi Journey 2

[![Made with pollinations.ai](https://raw.githubusercontent.com/pollinations/pollinations/main/packages/ui/src/brand/badge-made-with.svg)](https://pollinations.ai/?ref=badge)

Compose MIDI through conversation, bring a selected clip into the chat, and turn
ideas into clips in Ableton Live. Midi Journey 2 adds a piano-roll preview,
light/dark themes, browser sign-in, and a self-contained Max for Live device.

## Downloads

- **Midi Journey 2:** [Download ZIP](https://github.com/pollinations/MIDIjourney/releases/download/v3.0.0/Midi-Journey-2.zip) · [Release notes](https://github.com/pollinations/MIDIjourney/releases/tag/v3.0.0). Unzip and load **Midi Journey 2.amxd** on Main in Live.
- **Midi Journey Legacy:** [Download original device](https://github.com/pollinations/MIDIjourney/releases/download/v2.0.0/MIDIjourney.amxd) · [2024 release notes](https://github.com/pollinations/MIDIjourney/releases/tag/v2.0.0). Preserved unchanged; compatibility with current services is not guaranteed.

Midi Journey 2 is the product name. The release version is **3.0.0**, avoiding
reuse of the original download's `v2.0.0` tag.

## The Pollinations agent

The device uses the existing hosted **D1 prompt-based MIDIjourney agent**,
`community/pollinations-ai/midijourney`, through the Pollinations SDK. Its prompt,
model configuration, MCP tools and multi-step execution remain managed by
Pollinations. No TypeScript agent upload or production routing change is part
of this release.

You can ask the agent to use another supported model. Execution depends on its
available tools and models; naming a model alone is not proof that it was used.
Multi-step tool execution is managed by the hosted agent.

Sign in with your own Pollinations account. The welcome message and supported
exact transpositions run locally; other requests use your Pollen balance.
An agent request can involve multiple model/tool calls. No personal token is
embedded in the device.

## Use

1. Load one frozen **Midi Journey 2.amxd** on **Main**.
2. Click the OPEN/CLOSE label to open or close the editor. OPEN/CLOSE shows the click action; the connection indicator is green when signed in to Pollinations and coral when signed out.
3. Click **Connect**, finish signing in through your system browser, and return to Live.
4. Describe your musical idea. A selected MIDI clip appears as an input badge; its notes are read again when you send.
5. Select a Session MIDI clip or empty slot and click **Create clip**.

**Creating replaces an existing selected clip's notes, title and length, or fills the selected empty slot.** Other clips stay unchanged. Recording clips cannot be replaced. Output never redirects to a different slot.

The editor stays open while you change Live's selection. Each device load starts a fresh chat. Hiding and reopening the same window keeps the conversation; **New chat** clears it without deleting Live clips or signing out. Use the native right-click menu for Copy/Paste. Disabled Send and Create clip controls explain why on hover, focus or tap.

## Requirements

- macOS, regular **Ableton Live 12 with Max for Live**, and **Max 9.1.5+**. The current validation target is Live 12.4.6 with **Use bundled Max** selected in Live's settings. Live Beta is not required.
- Internet access and a Pollinations account with Pollen.
- One device instance; local port **5178** must be free.

The connector is a transparent Max Audio Effect on Main, using Live's Object Model to access MIDI tracks. Input follows one selected MIDI clip; output targets Session View. Windows and automatic multi-selection are not supported for this release candidate. Acceptance covers the tested setup; version requirements are not a guarantee for every Live version or add-on.

## Develop

Use Node **22.12+** and npm from the repository root:

```sh
npm ci
npm run verify
npm run dev
```

The browser preview cannot modify Live. Stop it before loading the device: both use port 5178. `npm run test:ui` serves isolated fake-account/provider fixtures on port 5186; they never ship in the device.

```text
app/      React UI and browser fixtures
core/     Agent requests, MIDI validation and conversation context
device/   Max LiveAPI bridge, embedded server and optimized artwork
scripts/  Build, native-freeze staging and artifact verification
vendor/   Pinned Pollinations UI package and license provenance
docs/     Privacy, troubleshooting and release checklist
```

Generation uses the managed `community/pollinations-ai/midijourney` agent through `@pollinations/sdk`. Native YAML/CSV and valid JSON responses are validated locally before use. The app does not send structured-output options or choose the agent's underlying model. The shared UI and theme system come from `@pollinations/ui`; see [dependency provenance](vendor/README.md).

Build configuration uses `MIDIJOURNEY_POLLINATIONS_APP_KEY` or the existing ignored `js/config.release.js`. That directory contains local configuration only. Builds never create or rotate keys. A key-free checkout builds a configuration-required screen; release preparation requires a configured publishable app key. Never commit personal tokens or local configuration.

## Build and freeze

```sh
npm run verify
npm run release:prepare
# Load the printed candidate in Live on Main; Edit in Max → Freeze Device → Save.
npm run release:verify -- "/path/to/Midi Journey 2.amxd"
npm run release:package -- "/path/to/Midi Journey 2.amxd"
```

`dist/` contains editable source output, not a frozen release. Preparation creates an isolated temporary Max project. The frozen device must embed all four runtime scripts and four optimized PNGs, with web assets/fonts inside the server bundle. It requires no Node or dependency installation inside Live.

Packaging creates `release/Midi-Journey-2/` and its ZIP with the verified device, installation guide, license, third-party notices and checksums. It refuses to overwrite an existing package. Release output is ignored by Git. Artwork masters and historical test packages are kept in a separate maintainer archive, outside the repository.

Verification checks the native container, embedded bytes, patch connections and UI against the current build. It does not prove Live behavior. Complete the [release checklist](docs/RELEASE_CHECKLIST.md) before publishing; do not distribute a stale candidate after source changes.

[Troubleshooting](docs/TROUBLESHOOTING.md) · [Privacy](docs/PRIVACY.md) · [Changelog](CHANGELOG.md)

## Credits

Created by Elliot Fouchy and Thomas Haferlach at Pixelynx's KORUS Labs, with artistic direction from Richie Hawtin and deadmau5. Powered by [Pollinations](https://pollinations.ai/). [MIT License](LICENSE).
