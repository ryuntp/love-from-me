# Handoff

This note lets a fresh session resume the work without the transcript. Update it at every unit boundary.

## Where things stand

- Branch: `claude/byd-seal-sentry-cameras-b3mi55` on `ryuntp/love-from-me`. Everything below `sealguard/` is the car app; the rest of the repo is an unrelated Flutter site.
- Toolchain: `sealguard/tools/bootstrap-toolchain.sh` then `tools/build-apk.sh` and `tools/run-tests.sh`. Verified end to end on a probe APK in this sandbox.
- Research: reports under the session scratchpad `research/` directory are not committed. The conclusions that matter are summarized in `docs/FRAMING.md` and will be summarized in `docs/PLATFORM.md` once the synthesis is read.
- Decisions: `docs/decisions.tsv`, append-only.

## Next step

Read the research synthesis, run the design arena (lean port vs companion app on OverDrive's daemon vs fork), then implement in the order: scaffold and diagnostics, camera and power port, sentry, extras, UI.

## Prior art to keep open while coding

- OverDrive (MIT): `github.com/yash-srivastava/Overdrive-release`. Camera open choreography in `app/src/main/java/com/overdrive/app/camera/PanoramicCameraGpu.java`, rail holds in `daemon/AccSentryDaemon.java`, daemon launch in `launcher/DaemonLauncher.kt`.
- BYD Extend (camera overlays): `github.com/hfagelnour/byd-turnsignal-cameraview`.
- Dolphin reverse engineering: `github.com/wheregoes/byd-dolphin-hacking`.
