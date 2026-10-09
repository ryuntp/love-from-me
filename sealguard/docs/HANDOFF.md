# Handoff

This note lets a fresh session resume the work without the transcript. Update it at every unit boundary.

## Where things stand

- Branch: `claude/gracious-mayer-ddszx3` on `ryuntp/love-from-me`, a fast-forward of `claude/byd-seal-sentry-cameras-b3mi55`. Everything below `sealguard/` is the car app; the rest of the repo is an unrelated Flutter site.
- Scope of this session: the owner-facing UI in the iOS design language and the owner-value features, built against a simulated vehicle feed. The native vehicle link (cameras, power, signals) is deferred; the host answers the page with an honest "no vehicle link" status.
- Toolchain: `tools/bootstrap-toolchain.sh`, then `tools/run-tests.sh`, `tools/build-apk.sh`, `tools/screenshot-ui.sh`. All four verified in this sandbox. A signed APK with the WebView host, the bridge and the launcher icon builds.
- Design: `docs/ARCHITECTURE.md` is the design package from a three-candidate arena plus a cross-judge. The data shapes live as JSDoc in the modules.
- Landed: the whole UI under `app/assets/ui/` and its tests under `ui-tests/`: 97 node tests, 28 screenshots in both orientations and both themes, a signed APK with the full UI. See the README's module map.
- Decisions: `docs/decisions.tsv`, append-only.

## Next step

Act on the adversarial review findings that remain open in the decision log, then the native vehicle link.

## Deferred

The native vehicle link. `docs/FRAMING.md` items 3 and 4 describe it and name the prior art to read when that work resumes. It is verified only on the car, through the Diagnostics screen.
