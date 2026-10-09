# Handoff

This note lets a fresh session resume the work without the transcript. Update it at every unit boundary.

## Where things stand

- Branch: `claude/gracious-mayer-ddszx3` on `ryuntp/love-from-me`, a fast-forward of `claude/byd-seal-sentry-cameras-b3mi55`. Everything below `sealguard/` is the car app; the rest of the repo is an unrelated Flutter site.
- Scope of this session: the owner-facing UI in the iOS design language and the owner-value features, built against a simulated vehicle feed. The native vehicle link (cameras, power, signals) is deferred; the host answers the page with an honest "no vehicle link" status.
- Toolchain: `tools/bootstrap-toolchain.sh`, then `tools/run-tests.sh`, `tools/build-apk.sh`, `tools/screenshot-ui.sh`. All four verified in this sandbox. A signed APK with the WebView host, the bridge and the launcher icon builds.
- Design: `docs/ARCHITECTURE.md` is the design package from a three-candidate arena plus a cross-judge. `docs/SKETCH.md` is the implementation contract and is deleted once the modules carry the shapes.
- Landed: `app/assets/ui/config.js` (the FIELDS settings table, total parser, one-key persistence) and `format.js`, with tests.
- In flight: workstream W0 (host, telemetry, sentry, parking, battery, tyres, recordings, main, app, sim, their tests, conformance test) and workstream W1 (tokens.css, app.css, ui.js, boot.js, screens, index.html, screens test). The briefs are in the session scratchpad and are summarized by SKETCH.md.
- Decisions: `docs/decisions.tsv`, append-only.

## Next step

When W0 and W1 land: run `tools/run-tests.sh` and `tools/screenshot-ui.sh`, look at every screenshot, fix the glue between the two halves, add a visible "Demo data" marker to the page when it runs on the simulator, run an adversarial review with correctness and platform lenses, delete `docs/SKETCH.md`, update this note and the decision log, commit in verified units and push.

## Deferred

The native vehicle link. `docs/FRAMING.md` items 3 and 4 describe it and name the prior art to read when that work resumes. It is verified only on the car, through the Diagnostics screen.
