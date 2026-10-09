# SealGuard

An owner app for the BYD Seal's infotainment display: an iOS-style interface for the car's parked-car recording feature (sentry), a timeline of recorded events, a live surround camera view, and owner-value features the car does not ship with: 12V battery health, tyre slow-leak detection, a sentry runtime budget, parking time-lapse and incident packs.

The app is HTML, CSS and plain ES modules inside an Android WebView. The UI lives under `app/assets/ui/` and is shipped inside the APK. The native side is a thin host that speaks JSON with the page; the protocol is in `docs/ARCHITECTURE.md`.

## Build and test

```sh
tools/bootstrap-toolchain.sh   # once; installs aapt2, apksigner, zipalign, dx, kotlinc and android.jar without the Android SDK
tools/run-tests.sh             # node --test over ui-tests/, then JUnit over app/src/test when it exists
tools/build-apk.sh             # build/sealguard-debug.apk, signed with a debug key
tools/screenshot-ui.sh         # every screen at 1920x1080, 1080x1920 and 1280x720, dark and light, plus the halted, recording, killed and sheet states, into build/screens/
```

The page runs in a desktop browser too:

```sh
chromium --allow-file-access-from-files "app/assets/ui/index.html?scenario=prowler&speed=60#/dashboard"
```

Scenarios are `night`, `prowler`, `leak`, `healthy` and `charging`. `speed` is virtual seconds per real second.

## What is verified where

- In this repository: every logic module has unit tests, scenario tests run whole nights through the same loop the page uses, and the screenshot script renders every screen in both orientations and both themes and fails on any console error.
- On the car: the vehicle link. This build's native host answers the page's hello with an honest status whose self-test says there is no vehicle link, so the screens show "Connecting to the car" and the Diagnostics screen shows the self-test. Adding the link means implementing the inbound messages in `docs/ARCHITECTURE.md` on the native side.

## Install on the head unit

1. Build `build/sealguard-debug.apk` and install it on the head unit the way you install any sideloaded app there.
2. Open SealGuard and follow the onboarding. The second page asks you to allow the app to start on its own in the car's settings; the car turns that off again after every install.
3. Choose the arming rule. "When locked" is the default.

## Layout

- `app/` the Android host: `AndroidManifest.xml`, `src/main/app/sealguard/` (the activity and the bridge), `res/`, `assets/ui/` (the page).
- `ui-tests/` Node tests over the page's modules.
- `tools/` build, test, screenshot and icon scripts.
- `docs/` framing, design language, architecture, the decision log and the handoff note.

## Module map

Under `app/assets/ui/`: `host.js` is the host boundary, the only parser of bridge text and encoder of commands. `telemetry.js` is the vehicle history at two resolutions. `sentry.js` is the sentry state machine. `parking.js`, `battery.js`, `tyres.js` and `recordings.js` are the owner-value features, each a pure function from the history to an assessment with a reason. `config.js` is the settings table and `format.js` the number wording. `main.js` holds the World and `advance`, the only writer of state; `app.js` is the DOM free runtime loop; `sim.js` is the deterministic host for the sandbox. `tokens.css` and `app.css` are the design language; `ui.js` is the component kit; `boot.js` mounts the shell; `screens/` holds one module per screen, each a pure `model` plus a `mount`.
