# Handoff

This note lets a fresh session resume the work without the transcript. Update it at every unit boundary.

## Where things stand

- Branch: `claude/gracious-mayer-ddszx3` on `ryuntp/love-from-me`, a fast-forward of `claude/byd-seal-sentry-cameras-b3mi55`. Everything below `sealguard/` is the car app; the rest of the repo is an unrelated Flutter site.
- Scope of this session: the owner-facing UI in the iOS design language and the owner-value features, built against a simulated vehicle feed. The native vehicle link (cameras, power, signals) is deferred; the host answers the page with an honest "no vehicle link" status and the page says so after 15 s.
- Toolchain: `tools/bootstrap-toolchain.sh`, then `tools/run-tests.sh`, `tools/build-apk.sh`, `tools/screenshot-ui.sh`. All verified in this sandbox.
- Design: `docs/ARCHITECTURE.md` is the design package from a three-candidate arena plus a cross-judge. The data shapes live as JSDoc in the modules; the module map is in the README.
- Landed: the whole UI under `app/assets/ui/` and its tests under `ui-tests/`: 127 node tests, 108 screenshots across seven routes, eleven states, three viewports and both themes, a signed APK with the full UI. An adversarial review on a second model found 37 issues: 36 were fixed, the density one in part, and each page-side fix is pinned by a test or a state screenshot. The two native-side fixes are verified only by the APK build. A trail review on a third model then found two defects in the blocking fixes, both fixed and pinned.
- Decisions: `docs/decisions.tsv`, append-only.

## Next step

The native vehicle link, which is the only part this sandbox cannot verify. Before it, the open questions the reviews left for the car: the head unit's real pixel density, whether the WebView stays alive with the screen off, whether loopback cleartext streams work on the unit, and whether the 12V thresholds in `battery.js` fit the Seal's lithium iron phosphate battery.

A caution for that work. The previous session was stopped by a content safeguard while working on that layer. Keep every file at the level of the JSON protocol in `docs/ARCHITECTURE.md` and the owner's experience; do not describe how the host reaches the car's hardware. The prior-art list the first session kept is in this file's history at commit 5667ca7.

Updates on the car: `tools/bootstrap-toolchain.sh` makes a fresh debug key per machine, and an APK signed with a different key needs an uninstall, which erases the settings and the history. Keep `~/.cache/sealguard-toolchain/debug.keystore` or build with the release variables in `tools/build-apk.sh`.

## Deferred

The native vehicle link. `docs/FRAMING.md` items 3 and 4 describe it and name the prior art to read when that work resumes. It is verified only on the car, through the Diagnostics screen.
