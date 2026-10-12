# Changelog

## MIDI Journey 2 — 3.1.0 (2026-10-12)

- A minimal device panel and chat that follow Ableton Live's colors, with a selected-clip badge and compact account controls.
- Resize the window to switch automatically between MIDI-only and full-chat layouts; the prompt has three or six lines.
- Native macOS copy/paste and undo shortcuts, a 420 × 550 starting window, and a floating editor that stays visible outside Live. Closing and reopening preserves its size and position.
- Connect directly through normal Pollinations authorization, with stable Connect/Cancel buttons and your Pollen balance in the toolbar.
- Connect sits on the left; Send and Trash stay on the right, disabled while disconnected. Reconnecting preserves the conversation, generated MIDI and draft.
- Click any MIDI preview to write it to the selected slot. While connected, Trash counts generated clips and remains usable above zero, including during generation.
- Removed hover tooltips, native empty-field popups, and cancellation messages from the chat.

macOS native component is ad-hoc signed, without Developer ID signing or notarization.

## MIDI Journey 2 — 3.0.0 (2026-10-11)

- Persistent, resizable chat using the shared Pollinations UI and SDK, light/dark modes and system-browser login.
- Chat-first MIDI Journey agent: Markdown/media replies alongside strictly validated YAML/CSV or JSON MIDI; tool transcripts never become clips.
- Free local welcome and exact single-clip transpositions; one SDK request per other message with no automatic paid retries.
- Keeps the existing hosted D1 prompt agent and its Pollinations MCP tools; no replacement code agent is required.
- Selected MIDI input, velocity-shaded piano-roll preview, and creation or in-place replacement of Session clips with native read-back checks.
- Compact composer and header, connection guidance on disabled Send, and native right-click Copy/Paste.
- Four-state OPEN/CLOSE device artwork with sign-in indication and transparent stereo pass-through.
- Fresh memory-only chat on each device load; hiding/reopening keeps the current conversation.
- Self-contained web assets, fonts and artwork; isolated native-freeze staging and exact-byte verification.

Published October 11, 2026. Local acceptance completed; remaining manual checks were confirmed by the maintainer.
