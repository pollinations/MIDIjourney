# MIDI Journey 2 — 3.1.0 release acceptance (2026-10-12)

The product is **MIDI Journey 2**; the downloadable file is `MIDI Journey 2.amxd` and the archive is `MIDI-Journey-2.zip`.

- [x] User requested publication and elected to proceed without Developer ID signing/notarization. The native component is ad-hoc signed; download documentation states that macOS may block it. Gatekeeper is not disabled.
- [x] Official Pollinations README badge and account/balance explanation are included. The repository cover is the user-provided Ableton screenshot (3020 × 1892 PNG), at `docs/images/midi-journey-2-catalog-artwork.png`.
- [x] Clean locked dependency installation, TypeScript, native build and source verification pass. Repository cleanup was rebuilt and rechecked against the published frozen device; runtime bytes still match. Final suite with the exact frozen artifact: **199 passed, 0 failed, 0 skipped**, including corrupted-script, patch-connection and native-bundle rejection checks.
- [x] Existing Keychain test credential accepted by production Pollinations; text-only and two-note MIDI generation passed with notes, starts, durations, velocities and clip length checked. No credentials changed. Production dependency audit: zero advisories.
- [x] The release runtime generated and wrote three demo clips in Live: Moonlit Steps, Velvet Pulse and Brushlight Groove. Clips remain in the Live Set; the test conversation was cleared before the final freeze.
- [x] Final native freeze saved in bundled Max 9.1.5 and verified against all current runtime scripts, native bundle, patch connections and allowed embedded files. Max's harmless removal of quotes around palette-query symbols is narrowly normalized; changed symbols and unrelated messages are still rejected.
- [x] Loaded only the final frozen AMXD from an isolated folder in regular Live 12.4.6. Correct product name, Open chat, empty welcome/draft, disabled zero-count Trash and 420 × 550 initial content size observed. Native multiline Unicode Command-C/V passed on this exact artifact; test draft cleared and original clipboard restored afterward. Window lifecycle, resize, theme, connection, generation/write and toolbar behavior were checked during the release's preceding Live sessions and covered by the final automated suite.
- [x] No conversation, generated MIDI, draft or personal login data is bundled. The embedded-file whitelist and saved jweb state pass; decompressed artifact scan finds none of the demo conversation/account markers. Sign-in on the test machine remains local. New device loads start empty; closing/reopening the same device preserves its in-memory session.
- [x] Packaged the frozen device, installation guide, license, dependency/font notices and SHA256SUMS. Extracted ZIP passes every checksum.
- [x] Published [v3.1.0](https://github.com/pollinations/MIDIjourney/releases/tag/v3.1.0) from source `4143aaf9247d6aa25ae3ed763825f68bbb602af9`. GitHub CI passes on Node 22 and 24. Downloaded the public ZIP and verified its checksum and every extracted file against the tested package. The CI native fixture was positioned within the actual runner screen; AppKit otherwise moves an off-screen fixture on first show. All geometry assertions remain intact; no production bytes changed.
- [x] Updated approved Pollinations submission [#17053](https://github.com/pollinations/pollinations/issues/17053) with the MIDI Journey 2 name, v3.1.0 download and commit-pinned screenshot; no duplicate submission.
- [x] Opened catalog update [#17139](https://github.com/pollinations/pollinations/pull/17139) with the MIDI Journey 2 name and matching screenshot. Catalog validation, formatting and eight catalog/screenshot tests pass.

Verified artifacts:

- Device SHA-256: `c35fc4f3b6c07df3a8a4189345d2f7d9bf81aee4bf83d8ab0f5d522a10b7161d` (838695 bytes).
- ZIP SHA-256: `e390ecef5466c3442428452ef709efd523082bb96248f97c4094d32232e830e5` (715424 bytes).
- macOS 27.0, regular Ableton Live 12.4.6, bundled Max 9.1.5. This release was verified on the maintainer's machine; no new independent-machine acceptance is claimed.
