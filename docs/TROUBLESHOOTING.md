# Troubleshooting

## Window does not open

Load one device on Main and click its image to open or close the editor. The headphone light indicates Pollinations SDK login (green) or signed out (coral), not local-server readiness. A green light does not guarantee the key is still accepted by the provider; a rejected credential is handled by the existing SDK/request flow. If the editor does not load, close other MIDI Journey instances and stop any preview using port 5178, then click the image to retry. If Max reports a missing script or artwork, you may have loaded an editable source file without its dependencies rather than the frozen release.

If the editor is blank but the server is running, check Live Settings → File & Folder → Max Application. Select the bundled Max (9.1.5 or newer), then restart Live. A manually selected older standalone Max can take precedence over the newer copy included with Live.

## Cannot connect

Use the account menu inside MIDI Journey. Sign-in happens in the system browser, not inside the embedded passkey window. Confirm the intended browser account and return to Live. Keep Live open throughout. An expired handoff can be canceled and started again.

Do not rotate the app key to troubleshoot ordinary login problems. Rebuilding does not clear or replace your personal session.

Hover, focus or tap disabled Send for connection guidance. While connecting, finish in your browser or use the compact Cancel button to try again. You can keep typing during sign-in.

## No MIDI input badge

Select a MIDI clip in Live. An empty slot supplies a destination but no notes. Audio clips are not MIDI input. Selection follows the current single clip; automatic multi-selection is not part of V3. The source is read afresh when you send.

## Create clip is disabled

Hover, focus or tap the disabled Create clip control to see the reason. Choose a Session slot on a MIDI track. An empty slot receives a new clip; an existing MIDI clip has its notes, title and length replaced in place. There is no automatic search for another slot. Stop recording before replacing a clip. If the destination changed since the button was clicked, select the intended clip and try again. Arrangement clips can be read as input, but writing requires a Session selection.

## A write warning appears

Do not click repeatedly. A timeout or read-back warning can mean Live created something but the connector could not confirm its exact contents. Inspect the destination and use Live Undo if appropriate. Writes are not automatically retried.

## Copy or paste seems unreliable

Use the prompt’s existing right-click menu for Copy/Paste. Standard keyboard shortcuts may be intercepted by Live/Max.

## Source changes do not appear

Only the frozen V3 release is portable. A source candidate must be reloaded after a bridge/runtime change; refreshing a web page alone does not reload Max JavaScript. Remove the old device first so you do not run two servers. Do not edit two copies simultaneously in Max.

## Report a problem

Include Live, Max and macOS versions, the device SHA-256/release tag, what you clicked and the visible error message. Review screenshots before sharing musical material; never share login tokens or OAuth callback links.
