# Native editing shortcuts (macOS)

`midijourney-shortcuts` is a Max external embedded alongside the jweb window.
Its build name includes a fingerprint of the native source, so updating the
device cannot reuse an older helper cached by an already-running Live process.
It routes Command-C/V/X/A/Z and Command-Shift-Z to Chromium's native editing
methods before Live handles the corresponding menu shortcuts. Clipboard data
never enters our JavaScript, Node server, logs, or a helper process. No debugger,
Accessibility permission, global event tap, or background daemon is required.

The local monitor accepts only key-down events belonging to the key window named
`MIDI Journey 2`, with a focused `RenderWidgetHostViewCocoa`. Other windows,
responders, modifier combinations, and shortcuts pass through unchanged. Multiple
instances share one monitor; deleting the last instance removes it. A Chromium
view-class change disables the workaround safely and requires revalidation.

The same component disables `hidesOnDeactivate` only for Midijourney browser
windows, preserving their floating level and position. It never activates Live
or reopens a closed editor. Original window settings are restored when the last
component is removed.

The editor is always resizable, with a 420 × 324 minimum and a 720 × 1400
maximum content size. Each new editor starts at 420 × 550, fitted onto its
current screen once. Closing and reopening keeps the same native window and
its exact position and size; no shared size preference overrides new devices. The web UI chooses its layout from the usable height:
below 520px it shows the latest MIDI and a three-line prompt; taller windows
show the conversation and a six-line prompt. There is no manual layout toggle.

## Build

Install Xcode command-line tools and obtain Cycling '74's official SDK headers:

```sh
git clone https://github.com/Cycling74/max-sdk-base.git /path/to/max-sdk-base
git -C /path/to/max-sdk-base checkout c03a2922a2a8ff149165a1e2ea134e9321d6e202
MAX_SDK_PATH=/path/to/max-sdk-base npm run build
```

The build produces a universal arm64/x86_64 external, ad-hoc signed for local
use. Native release preparation includes it in the Max project; freeze and
verify the resulting device as usual. The maintainer elected to distribute
3.1.0 without Developer ID signing or notarization. macOS may block the native
component after download; this limitation must accompany the release. Do not
disable Gatekeeper to load a release. A signed/notarized release remains future work.
The SDK license is included in `MAX-SDK-LICENSE`.

## Acceptance

In Live 12.4.6 / bundled Max 9.1.5, the initial native prototype passed actual
Command-A/C/V/X/Z/Shift-Z tests with multiline Unicode text, repeated paste, and
undo/redo. Elliot also confirmed copy/paste with the physical keyboard.
The final bundled component and frozen release must be rechecked after changes.
Use an isolated set; verify selection replacement, copying generated reply text,
right-click editing, Live shortcuts outside the editor, and device removal.
