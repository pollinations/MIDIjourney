# Current release: Midi Journey 2 only

The two-device checks below are historical. The current candidate removes the
Legacy response adapter, device-version switch, new Legacy sign-in and Legacy
build command. The original GitHub download is unchanged. Historical Legacy
source is retained outside the active build; it is not a release candidate.

- [x] Release decision: retain the existing hosted D1 prompt agent, its MCP tools and multi-step runtime. The local TypeScript-agent experiment is removed; no upload or production change is required.
- [x] Restarted the local host with the simplified agent. Real model checks without a device-version marker pass: a text-only musical answer and a structured MIDI request with both expected pitches, times, durations and velocities verified.
- [x] Local suite after simplification: 180 passed, 0 failed, 1 frozen-artifact check skipped; type checks and source-build verification pass.
- [x] Final native freeze saved in bundled Max 9.1.5 on 2026-10-11. Native container, patch connections, embedded scripts and artwork match the hosted build exactly.
- [x] Frozen candidate suite after D1 cleanup: 177 passed, 0 failed, 0 skipped, including corruption checks. Four checks specific to the removed TypeScript-agent experiment were removed with that experiment. Source-build and exact frozen-byte verification pass.
- [x] Prepared local unpublished `release/Midi-Journey-2.zip`; extracted archive checksums all pass.
- Device SHA-256: `8a9f59e313b2b42c685e385e051f5f74dc4e1a695252baee0ca4a62244cc2dde` (983668 bytes).
- ZIP SHA-256: `7d5a8f46a445628fdae39b8e5e1df72e6054e1dd633751374f0fda863a328fcd`.
- Build source fingerprint after D1 cleanup: `207603776b06d26dd8ebdcb0eb3ebeda8e9256fa08ef8f5c12e8238707e1d540`. Runtime bytes are unchanged from the frozen candidate.
- [x] Frozen standalone smoke test in regular Live 12.4.6: isolated AMXD with no sibling assets, local agent stopped; UI opens, existing hosted agent generates MIDI, and Create clip succeeds. Saved ALS confirms pitches 60/64, starts 0/2, durations 2/2 and velocities 100/100, with the isolated AMXD path.
- [x] Fresh-process regular-Live reopen displays a fresh chat and `Frozen test.midi`. All four executing scripts are extracted under Max's temporary collection directory and exactly match `dist`. Evidence: `/private/tmp/Midi Journey frozen acceptance Project/Midi Journey frozen acceptance.als` and `/private/tmp/mj-frozen-reopened.png`.
- During reopen, Finder's default association launched Beta and caused a port conflict. Beta was closed; reloading explicitly in regular Live passed.
- [x] File-independence acceptance on macOS 27.0 / regular Live 12.4.6: quit Live, temporarily made the entire checkout and freezing folder unreadable, verified reads failed, then restarted Live and reopened the isolated saved Set. Chat, restored account and `Frozen test.midi` rendered; loopback UI returned HTTP 200 and context reported connected. Both folder permissions were restored and verified. Evidence: `/private/tmp/mj-source-inaccessible.png`. This is same-machine isolation, not independent-machine acceptance.
- [x] Native editor checks: browser-assisted connection returns the account/balance, account menu opens, light/dark switch renders, and native Copy/Paste operates. OPEN/CLOSE labels toggle while signed in and signed out; clicking the illustration does not toggle. Connected artwork remains connected through close/reopen.
- [x] Rechecked saved `Frozen test` note data and unchanged AMXD/ZIP hashes after acceptance. Direct left/right audio passthrough wires are present in the frozen patcher (structural verification only).
- [ ] Native cancellation, New chat during a pending reply, draft/conversation retention, narrow-window resize, title-bar close synchronization, live selection changes and destructive-write edge cases remain unverified on this frozen candidate. Automation repeatedly routes editor input to the Live Set behind it, even after identifying/raising the editor. Attempts stopped; transport left stopped. Automated cancellation/selection/write-safety tests pass, but are not substitutes for these native checks.
- [ ] Measured stereo audio passthrough remains; wiring inspection does not establish signal equality.
- The build fingerprint above identifies the release source; the GitHub draft release records the exact source commit. The frozen runtime is unchanged by the D1 cleanup. Production and published downloads remain unchanged.
- [x] Maintainer confirmed completion of the remaining acceptance step on 2026-10-11, including the manual/independent-machine checks. This is user-reported acceptance, not additional automated evidence. Earlier tool-blocked items above describe the automation result.
- [x] Existing hosted-agent integration was tested with the frozen device; testing a replacement code-agent revision is no longer applicable.

# Two-device local validation — 2026-10-11

The historical frozen artifact described below predates the shared code agent
and new branding. It is **not** the candidate for this change.

- [x] One root `agent.ts`, Legacy default and explicit Midi Journey 2 mode.
- [x] Real model responses for both modes; valid MIDI and provider usage returned.
- [x] Midi Journey 2 loaded in regular Live 12.4.6, generated and created a clip.
- [x] Saved Set readback confirms pitches 60 and 64, start times 0 and 2, durations 2.
- [x] The two outdated UI contracts now match label-only OPEN/CLOSE and shared neutral/themed cards. Full run: 187 passed, 0 failed, 1 frozen-artifact check skipped. Type checks pass. The added release-routing guard also passes separately (4 passed, 1 frozen-artifact check skipped). Fresh native freezing remains required.
- [x] Legacy native generation and clip write in regular Live 12.4.6: “Mourning Frog”, 76 notes. Saved Set readback matches every generated pitch, start, duration (within Live float precision) and velocity.
- [x] Fixed Legacy saved Node autostart and packaged validate.svg; retest passed.
- [x] Hosted preparation: both configurations build; Legacy SDK sign-in/session rejection/cancellation tests pass with simulated HTTP. Real local-agent smoke through the new Legacy SDK transport returns valid YAML/CSV with two notes. Current `dist/` candidates were rebuilt with local routing. Hosted code-agent acceptance remains pending publication approval.
- [x] UI updated to published `@pollinations/ui@0.1.0-alpha.11`; branded pixel-art assets optimized to 338 × 338, under 38 KB each. Browser fixture verified MIDI preview, one clip write, account menu, and light/dark mode.
- [x] User confirmed the rebuilt modern device loads without the unnamed-project warning and reads Fire Castle successfully.
- [ ] Inspect the latest equal-side/bottom spacing in Live.
- [x] Large-clip creation in regular Live 12.4.6 (2026-10-11): user ran the device UI to transpose Fire Castle up one semitone and create in an empty slot. Saved Set inspection confirms all 512 notes across 256 beats/64 bars, expected pitches, unchanged timing/duration/velocity (1e-5 tolerance), and six original Session clips unchanged. Automated 2,048-note read/write test also passes.
- Legacy startup revalidation is outside the revised release scope.
- [x] Saved and reopened the modern test Set in regular Live; device reopened with a fresh chat, and the new 512-note Fire Castle clip retained its 64-bar length and verified note data.
- [x] Saved and reopened an isolated Legacy acceptance Set with both devices loaded; the earlier Legacy-generated “Mourning Frog” retains 76 notes and identical serialized note data. This checks persistence, not a new Legacy generation or a frozen standalone install.
- [ ] Freeze Midi Journey 2 and verify embedded source hashes.
- [ ] Publish Midi Journey 2 only after separate approval.

Production agent, D1 prompt, gateway, routing and published downloads are unchanged.
No claim of compatibility with every Live edition, version or add-on is made.

## Current release scope — simplified

Only **Midi Journey 2** is a release target. The existing D1 prompt agent stays unchanged.
The original 2024 download stays unchanged. Do not prepare or publish an updated
Legacy device. Earlier Legacy implementation and validation entries above are
historical work, not requirements for this release.

1. Finish Midi Journey 2 local UI acceptance. Large-clip creation, save/reopen and the corrected UI tests already passed.
2. Keep normal user sign-in and the existing hosted D1 prompt-agent configuration; retain the historical Legacy download.
3. No agent upload or production routing change is needed. Any later hosted-agent changes require separate approval and validation.
4. Freeze and verify Midi Journey 2, test without the checkout or local agent, and prepare one downloadable package with licenses and checksums.
5. Record the source revision and artifact hashes, finish independent-machine acceptance, and present the download for publication approval.

Older MIDIjourney model entries should temporarily coexist with the community
agent, receive a deprecation warning, then leave the model list. This is a plan,
not an executed registry change. Confirmed removal date: **November 1, 2026**.
The deprecation warning should precede removal; the community agent remains.
The exact older model IDs must be confirmed against the live registry before implementation.
A server console warning is operational only; it is not a notice users of an
already-downloaded device will necessarily see.

Announcements and news are outside this task. No merge, deployment, scheduled
removal, tag or public upload is authorized by this preparation step.

The historical V3 checklist below is retained as an audit record, not evidence that the current candidates passed those checks.

---

# V3 release checklist

**Not published.** The current device was frozen on 2026-09-15 with regular Live 12.4.5 / bundled Max 9.1.5 and byte-verified again during the 2026-10-10 cleanup.

- Candidate: `release/MIDI-Journey-V3/MIDI Journey.amxd`.
- SHA-256: `2b6fb71cefc909ce1a18fd8ab41e66f2562eeb1210f3637a42b651134fd1cf5d`.
- Clean `npm ci` and all 175 automated tests passed on 2026-10-10 using Node 22.21.1, including frozen-file corruption checks, with zero skips. The source snapshot included the uncommitted files required for the build. The release package was generated from that clean installation.
- Old release packages, the duplicate V3-1 copy and artwork masters were archived outside the repository on 2026-10-10. The archived Thomas package is not the release candidate.
- The current source includes uncommitted work on top of `a7a0c06b5519ef2dd855f99c9d628f0b02f49daa`; a final source commit is not yet recorded.
- Fresh-process native acceptance and independent-machine testing remain. Byte verification does not complete those checks.

The packaged README records the build source fingerprint. Documentation and packaging-only changes do not require a new native freeze when the frozen device still passes exact-byte verification against the rebuilt output. Runtime or patch changes require a new freeze.

## Build the final candidate

- [x] Clean `npm ci` and `npm run verify` pass on the current source snapshot (Node 22.21.1).
- [ ] Repeat validation on the final source commit; CI passes on Node 22 and 24.
- [ ] If runtime or patch bytes changed, run `npm run release:prepare` with the existing authorized app-key configuration.
- [ ] If a new freeze is needed, load only that candidate on Main in regular Live; Edit in Max, Freeze Device, Save.
- [x] Run `npm run release:verify -- <candidate>` against the same build. Optionally run the full tests with `MIDI_JOURNEY_FROZEN_CANDIDATE` pointing to it for corruption checks.
- [x] Run `npm run release:package -- <candidate>` to create the five-file release folder and ZIP. Archive existing output first; the command refuses to overwrite it.
- [x] Verify `SHA256SUMS` after extracting the ZIP. Check the installation guide, project license and third-party/font notices.
- [ ] Record source commit, frozen SHA-256, macOS/Live/Max versions and tester below.

## Test the exact frozen device

Use a disposable Set. Initial target: regular Live 12.4.5 with bundled Max 9.1.5, not Beta.

- [ ] Fresh Live process loads with checkout/staging assets unavailable. No missing resources, dependency install, developer account or preloaded chat.
- [ ] One device on Main passes stereo audio through unchanged.
- [ ] All four artwork states work. Only OPEN/CLOSE label clicks open/close; title-bar close updates the image. Login indicator follows SDK sign-in, not server readiness or balance.
- [ ] Open/close/resize preserve the current conversation; remove/reload starts fresh. Welcome stays first; New chat cancels generation and clears creative context.
- [ ] Browser login, Cancel, return/confirmation, profile, balance and dashboard work. Disabled Send shows the correct connection tooltip; typing remains available.
- [ ] Existing MIDI / empty slot / audio selection updates input and creation state without closing. Edits made to the source clip are read afresh on Send.
- [ ] Text-only and selected-MIDI generation through the managed agent both produce valid previews.
- [ ] Create writes correct notes, timing, velocity and length; native read-back passes.
- [ ] Existing selection is replaced in place, including notes outside its loop. Title/length update; clip identity and other clips remain untouched. A full track can still replace its selected clip.
- [ ] Recording, stale, audio and Arrangement destinations are rejected before mutation. Writes are not retried automatically; observe Undo behavior.
- [ ] Cancel/New chat cannot resurrect canceled results or cause late writes.
- [ ] Right-click Copy/Paste, light/dark themes, narrow layouts, account menu and disabled-button tooltips work in Live.
- [ ] Save Set, quit Live, reopen: no missing files, fresh conversation, own login only.
- [ ] Thomas's independent-machine test passes or reported issues are resolved and retested.

## Publish only after approval

Wait for explicit user approval after reviewing the final candidate. Then commit/push the finalized source, tag `v3.0.0`, and attach the exact verified AMXD, checksum and release notes. Download the published asset and verify its checksum. Never silently replace an existing release asset.

## Final acceptance record

- Source commit:
- Frozen SHA-256: `2b6fb71cefc909ce1a18fd8ab41e66f2562eeb1210f3637a42b651134fd1cf5d`
- Build source fingerprint: `dbd73b473e2d7e4ffe23f7add3318163c86a31a519eba3c87cb4cf60280f0c66`
- Prepared ZIP SHA-256: `6d8a19709d949afef7166f11aa2ccc3251832977d25ce1a16d787cd81edf25d8`
- macOS / Live / Max:
- Tester and date:
- Native checks observed / remaining issues:

Unit tests and byte verification are not substitutes for the native checks above.
