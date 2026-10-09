# SealGuard UI architecture

The design package for the owner app: the HTML, CSS and ES module UI inside the WebView host, plus the owner-value features. It came out of a three-candidate design arena; the synthesis decision below records what was kept and dropped. SKETCH.md holds the module map, data shapes and signatures the implementation is built against.

## Problem

The app runs as plain ES modules inside the Android 10 WebView on the Seal's 1920x1080 display, with Chromium 74 as the floor, no bundler, no runtime dependencies and no type checker. Node 22 imports the same files for tests. Vehicle signals, camera streams, recordings and power control sit behind a native host that does not exist yet; a deterministic simulator stands in for it in the sandbox. Four facts make the shape non-obvious.

1. Sentry state is split across a bridge that can drop or restart. The page decides arming, recording and floors. The host owns the cameras, the files and the power rails and keeps running when the page reloads, so a reload must converge on what the host is really doing.
2. The features read telemetry at three horizons: seconds around an incident, hours for the runtime budget, weeks for the 12V and tyre trends. localStorage is the only persistence the page has.
3. With no type checker, a JSDoc union constrains only the code that constructs it. Illegal sentry states have to be impossible to build, not merely undocumented.
4. The camera and power layers are one-way doors. The kill switch has to keep working when the page itself is what broke.

## Shape

**One immutable World, one writer.** `advance(world, input, now)` in `main.js` is the only function that replaces World. Host messages, owner intents, hash changes and clock ticks all enter through it, so "what can change X" has one answer for every X.

**Parse once at each boundary.** `host.js` is the only code that sees bridge text. Its parser is total: malformed, out-of-range, wrong-version or disallowed-URL input becomes a `rejected` input that Diagnostics counts. Commands are domain objects that `host.js` encodes; the wire format never leaves it. `config.js` and `telemetry.js` parse localStorage the same way. Inside, nothing re-validates.

**Sentry is a machine over parking sessions.** `driving` is its own mode with no armed variant, and `recording` always carries `armedAt` and a clip, so armed-while-driving and recording-while-disarmed cannot be built. `starting` collects one snapshot and one host status and decides once, adopting whatever the host is already doing, which is how a reload mid-recording resumes the same clip without persisting any sentry state. A request the machine cannot honor returns the same state plus an alert that says why. A floor must stay crossed for 30 s before sentry halts, because a one-second sag from a door actuator must not end sentry for the night; the car's own 12V LOW flag halts at once. Feeding the same input twice yields the same state and no new effects.

**The host owns what must outlive the page; the page owns policy.** Media, the event index, power rails and the kill latch live in the host. Arming rules, floors, sensitivity, retention and cadence live in the page. The kill switch is a host latch because a kill switch that depends on the code it stops is no kill switch. The dashboard shows a red banner while the host reports it on.

**Derive at read time.** Assessments are never stored. The dashboard's runtime estimate and the reducer's time-lapse cadence call the same `runtimeBudget` on the same World, so they cannot disagree.

**Persistence is a function of state.** After each advance, `createApp` writes config when its reference changed and history when the kept series changed. There is no save effect to forget. Config is one key written with one `setItem`, and `parseConfig` is total, so a crash mid-write reloads as either the old or the new whole value. History rewrites only the newest day's key.

**One telemetry store at two resolutions.** `recent` keeps ten minutes at full rate in memory. `kept` keeps 45 days on disk at one sample per ten minutes plus every power, lock and charge transition and the 15 s after each power change. That one policy feeds incident packs, the runtime budget, 12V rest and sag, and cold tyre readings.

**The incident pack is sealed when the clip closes.** That is the only moment its surrounding telemetry is certain to be in memory. The pack rides inside the `saveEvent` command, so a later export is a file copy on the host.

**One settings table.** `FIELDS` in `config.js` lists each setting's group, label, footer, options or range, and default. `parseConfig` reads it and the Settings and Onboarding screens build their controls from it, so the UI cannot offer a value the parser rejects.

**Routes live in the URL hash.** Navigation is plain links to `#/route`. The host already sends the back button to `goBack`, so it walks screen history with no extra code, and the screenshot runner's URLs work unchanged.

**Screens are a pure model plus a dumb mount.** `model(world, now)` decides every word, number and tone and runs in Node. `mount` builds DOM once and returns `update`, which only copies fields into nodes. No virtual DOM.

**The platform rules are tests.** `conformance.test.mjs` fails on syntax or CSS newer than Chromium 74, on color or size literals outside `tokens.css`, on text under 20 px, on a logic module importing `ui.js` or a screen, and on a module touching the DOM at import. The visual gate is `tools/screenshot-ui.sh`, which fails on any console error.

## Host protocol

Two streams of JSON text. Every inbound message carries `"v": 1` and a type tag `"t"`.

| Inbound `t` | Fields | When |
|---|---|---|
| `vehicle` | at, power off, acc or on, locked, charge, v12, v12Low, hvV, soc, tyres or null | 1 Hz while awake, every 10 s while parked |
| `detection` | at, trigger motion or impact, cameras, score from 0 to 1 | any score above the host's noise floor; the page applies sensitivity |
| `status` | version, killed, theme, autostart, watch, recording, lapse, cameras with fps, mosaic url and layout, selfTest | on change, every 10 s, in reply to hello |
| `events` | the recorded event index with clip, thumb and layout | in reply to hello, saveEvent and deleteEvents |
| `exported` | id, ok, where | after exportEvent |

Outbound commands are hello, startWatch, stopWatch, startRecording, stopRecording, saveEvent, deleteEvents, startLapse, stopLapse, exportEvent, setKill and openAutostart. Two rules make up the whole contract a reload depends on. Every command names the session, clip or event it acts on, and a repeat is a no-op. Status echoes watch, recording and lapse exactly as last commanded.

## Synthesis decision

Three candidates ran on three models against the same brief. All three converged on one immutable model, one pure transition function, a parse-once host boundary, a tagged sentry state and a settings table. They differed on rendering, persistence and sample storage.

Candidate B is the base. Its screen split, a pure `model` plus a dumb `mount`, keeps every word and tone testable in Node without a reconciler. Its single history at two resolutions feeds every feature from one retention policy. Its persistence needs no save effects. Its `driving` mode and `starting` adoption close the two illegal pairs by construction and make a reload converge without saved sentry state.

Grafted from candidate A: the settings table carries group, label and footer so Settings renders from it; the `prowler` scenario, so detections and the alert path render in the sandbox; a keyed `syncList` helper so the timeline updates in place.

Grafted from candidate C: a reduced-motion switch in config, because the WebView may not forward the system setting; the red kill banner on the dashboard; the honest `learning` verdict and the `basis` label on the budget, so a guess is never shown as a measurement; the tokens checks in the conformance test.

Rejected from C: the hand-written vnode reconciler, about 150 lines whose bugs only the screenshot script would catch; the two-slot config persistence, which buys nothing over one atomic `setItem` plus a total parser; ledger compaction with keep ranges derived from the event index, which the sealed-at-close incident pack makes unnecessary. Rejected from A: per-feature sample rings with three sampling policies, which the single history replaces; events persisted in the page, which the host owns.

The cross-judge's verdict is recorded in decisions.tsv.

## Tradeoffs accepted

- We accept copying World slices on every input in exchange for reference equality deciding persistence and rendering with no dirty flags.
- We accept recomputing the battery and tyre assessments on every render of the Car screen in exchange for never storing a derived value.
- We accept unchecked JSDoc unions in exchange for zero build steps. `step` is the only constructor of a sentry state and a seeded property test drives random input sequences through it looking for a forbidden state.
- We accept a 30 s delay before a floor halts sentry in exchange for no false halts from transient sag.
- We accept that `sim.js` ships in the APK and is parsed on every start, since imports must be static, in exchange for one entry page and a sandbox that exercises the exact parse path the car uses.
- We accept that the kill switch shows its new state only after the host confirms it, in exchange for one source of truth that survives a broken page.
- We accept English copy inside domain modules in exchange for one source per sentence and reasons that tests can assert.

## Open questions

- Who runs `step` while the head unit screen is off? If the native host cannot keep the WebView alive, `step` is pure JSON in and out, so the scenario tests become the contract for a port.
- Is the Seal's 12V battery lithium iron phosphate? The 12.4 V default floor assumes it.
- Which triggers can the host observe? The design assumes camera motion and impact.
- Does 45 days of kept history fit the WebView's localStorage quota from `file://`? The estimate is under 1 MB and `saveHistory` drops the oldest days on a quota error.
