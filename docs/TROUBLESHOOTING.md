# Troubleshooting

## Window does not open

Load one **MIDI Journey 2** device on Main and click **Open chat**. If the editor does not load, close other instances and stop any preview using port 5178, then reopen it. Missing scripts or native components can mean an editable source device was loaded without its dependencies instead of the frozen release.

For a blank editor, check Live Settings → File & Folder → Max Application. Select bundled Max (9.1.5 or newer), then restart Live.

## Cannot connect

Click **Connect** in the floating chat. Sign-in and authorization happen in the system browser. Use the intended Pollinations account and return to Live; connection completes automatically. Keep Live open throughout. An expired handoff can be canceled and started again. You can keep typing during sign-in.

The avatar opens your dashboard, and the Pollen amount opens this app's key management. Do not rotate the app key to troubleshoot ordinary login problems. Rebuilding does not replace your personal session.

## No MIDI input badge

Select a MIDI clip in Live. An empty slot supplies a destination but no notes. Audio clips are not MIDI input. The source is read afresh when you send.

## MIDI preview cannot be written

Choose a Session slot on a MIDI track, then click the generated MIDI preview. An empty slot receives a new clip; an existing MIDI clip has its notes, title and length replaced in place. Stop recording before replacing a clip. If the destination changed since the click, select the intended clip and try again. Arrangement clips can be read as input, but writing requires a Session selection.

## A write warning appears

Do not click repeatedly. A timeout or read-back warning can mean Live created something but the connector could not confirm its exact contents. Inspect the destination and use Live Undo if appropriate. Writes are not automatically retried. Detailed verification messages go to the console.

## Copy or paste seems unreliable

Command-C/V/X/A and Command-Z/Shift-Z work inside the editor. The prompt's right-click menu is also available. Version 3.1.0 embeds a native macOS component for these shortcuts and window behavior; it is ad-hoc signed without Developer ID signing or notarization, so macOS may block it after download. Do not disable Gatekeeper.

## Source changes do not appear

Only the frozen release is portable. A source candidate must be reloaded after a bridge/runtime change; refreshing a web page alone does not reload Max JavaScript. Removing or reloading the device clears chat history. Remove the old device first so you do not run two servers. Do not edit two copies simultaneously in Max.

## Report a problem

Include Live, Max and macOS versions, the device checksum/release tag, what you clicked and the visible error message. Review screenshots before sharing musical material; never share login tokens or OAuth callback links.
