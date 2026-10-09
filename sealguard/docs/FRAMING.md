# SealGuard framing (figure-it-out Phase A)

Target car: BYD Seal Premium 2023, overseas build (Thailand), DiLink 4.0 marketing name. Head unit: Android 10 (API 29), Qualcomm QCM6125, firmware branch 13.1.33.x (2026 builds such as 13.1.33.2602030.1). OverDrive's code calls this same unit "DiLink 3.0" and treats it as its primary tested platform.

## Definition of done (falsifiable)

A reviewer can check each line without talking to us.

1. `tools/build-apk.sh` produces a signed APK from a clean checkout in this sandbox, and `tools/run-tests.sh` passes.
2. The APK installs on an Android 10 (API 29) device without AndroidX or Google services, and every screen renders in both landscape and portrait at 1920x1080.
3. With wireless ADB enabled on the head unit, the app starts a shell-uid helper that opens `android.hardware.AVMCamera`, finds the panoramic camera through `BmmCameraInfo`, and records all four surround views into one MP4 per event, with pre-roll.
4. Sentry arms on power level OFF, holds the BYD power rails OverDrive holds, stops on the 12V LOW callback and on a configurable HV state-of-charge floor, and disarms on ACC ON.
5. The UI follows the iOS design language: large titles, grouped inset lists, SF-style type, segmented controls, toggles, sheets, light and dark themes.
6. At least two features ship that neither BYD nor OverDrive nor BYD Extend offer on the Seal, each with unit tests over its logic.
7. A diagnostics screen reports camera ids, frame rate, power level, rail write results and 12V voltage so the owner can verify on the car what we cannot verify here, and a runbook tells them how.

Items 3 and 4 cannot be verified in this sandbox. They are verified by porting the proven mechanisms faithfully, by contract tests over our source, and by the owner running the diagnostics screen. We say so in the README.

## Scope, quantified

Roughly: helper daemon and camera port (2k lines Kotlin), sentry state machine and recorder (1.5k), vehicle signals (0.8k), extras (1.5k), UI (HTML/CSS/JS or Views, 2.5k), docs and tests (1.5k). Revised in the design arena: the sentry policy, the floors and the extras run in the page as JavaScript, so the sandbox can verify them; the native side keeps the cameras, the files, the power rails and the kill latch. See docs/ARCHITECTURE.md. One to two sessions of work if nothing surprises us. The toolchain, the research and the design arena come first because every later unit depends on them.

## Blockers surfaced by grounding

- No car and no emulator for the BYD HAL. Camera, power and vehicle APIs can only be exercised on the real head unit.
- dl.google.com is blocked, so no Android SDK, AndroidX or Compose. The build uses Ubuntu tools plus Maven Central. The UI must be platform Views or a WebView.
- Wireless ADB must be on. Owner reports say some 2026 firmware builds block USB APK installs with a safety-check dialog and that a newer "2.3.0" build on the Seal U removed debugging access. Whether the Thai Seal build keeps ADB is the single largest unknown; the web research slice is on it.
- BYD re-blocks third-party autostart on every install. The onboarding must walk the owner through the autostart toggle.

## Rigor level

High for the camera and power layers: they are one-way doors in the sense that a wrong rail write or a wedged camera handle blanks the owner's reverse camera. Faithful port, contract tests, and a kill switch in the diagnostics screen. Medium for the sentry logic and extras: pure Kotlin, unit tested here. Low for UI polish: reversible and cheap to change.

## Playbook

1. Grounding: parallel deep read of OverDrive, BYD Extend and the Dolphin notes, plus web research, synthesized (running).
2. Design arena: three structurally distinct candidates (lean port, companion app on top of OverDrive's daemon, fork and re-skin) judged on a written rubric, synthesized into one design package.
3. Throughput checkpoint, then implementation in verifiable units: scaffold and diagnostics first, camera and power port second, sentry third, extras fourth, UI throughout.
4. Adversarial review with correctness, platform-compatibility and security lenses; fix confirmed findings.
5. README, install runbook, decision trail, handoff note.
