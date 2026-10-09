# Handoff

This note lets a fresh session resume the work without the transcript. Update it at every unit boundary.

## Where things stand

- Branch: `claude/gracious-mayer-ddszx3` on `ryuntp/love-from-me`, a fast-forward of `claude/byd-seal-sentry-cameras-b3mi55`. Everything below `sealguard/` is the car app; the rest of the repo is an unrelated Flutter site.
- Scope of this session: the owner-facing UI in the iOS design language and the owner-value features, built against a simulated vehicle feed. The native vehicle link (cameras, power, signals) is deferred; the host answers the page with an honest "no vehicle link" status and the page says so after 15 s.
- Toolchain: `tools/bootstrap-toolchain.sh`, then `tools/run-tests.sh`, `tools/build-apk.sh`, `tools/screenshot-ui.sh`. All verified in this sandbox.
- Design: `docs/ARCHITECTURE.md` is the design package from a three-candidate arena plus a cross-judge. The data shapes live as JSDoc in the modules; the module map is in the README.
- Landed: the whole UI under `app/assets/ui/` and its tests under `ui-tests/`: 127 node tests, 108 screenshots across seven routes, eleven states, three viewports and both themes, a signed APK with the full UI. An adversarial review on a second model found 37 issues; all were fixed and each fix is pinned by a test or a state screenshot.
- Decisions: `docs/decisions.tsv`, append-only.

## Next step

The native vehicle link, which is the only part this sandbox cannot verify. Before it, the open questions the review left for the car: the head unit's real pixel density, whether the WebView stays alive with the screen off, and whether loopback cleartext streams work on the unit.

## Deferred

The native vehicle link. `docs/FRAMING.md` items 3 and 4 describe it and name the prior art to read when that work resumes. It is verified only on the car, through the Diagnostics screen.
