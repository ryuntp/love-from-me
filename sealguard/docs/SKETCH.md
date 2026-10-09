# SealGuard UI sketch

This is the implementation contract synthesized from the design arena (see ARCHITECTURE.md). Candidate B is the base. The deltas below are the grafts; everything else is as B wrote it. Delete this file once the code exists and the JSDoc in the modules is the only copy of these shapes.

Deltas from candidate B:

- `main.js` keeps World, `advance` and `createApp`. `boot` moves to `boot.js`, which is the only module that touches the DOM at import time, so the logic hub and the DOM shell have separate owners.
- `fmt` lives in `format.js`, already implemented, so sentry wording and screen models share it without a logic module importing `ui.js`.
- `config.js` is already implemented. `CONFIG_SCHEMA` became the ordered `FIELDS` table, whose rows carry `group`, `label` and `footer` so the Settings and Onboarding screens render from it. Config gained `deterrent` and `reduceMotion`. `startWatch` carries `deterrent`.
- `sim.js` scenarios are `night`, `prowler`, `leak`, `healthy` and `charging`; `prowler` sends detections so the events timeline and the alert path render in the sandbox.
- `ui.js` gains `syncList(parent, items, keyOf, create, update)` for keyed rows, so the timeline updates in place.
- The dashboard shows a red banner while the host reports `killed`, so a forgotten kill switch cannot hide.
- `tokens.css` zeroes every duration both under `prefers-reduced-motion` and under `[data-motion=reduce]`, which `boot.js` sets from `config.reduceMotion`, because the WebView may not forward the system setting.
- `step(state, input, config, now)` takes no History. Sentry emits only startWatch, stopWatch, startRecording, stopRecording, `clipClosed` and alert. `advance` in `main.js` turns `clipClosed` into `saveEvent` with the pack from `recordings.js`, and diffs the plan from `parking.js` against `world.lapse` to emit startLapse and stopLapse. So `sentry.js` imports only `config.js` and `format.js`, and the call chain from the hub is two files deep.
- `createApp` moves to `app.js`. `main.js` is World, `initialWorld` and `advance` only. World gains `lapse`, the last lapse command sent, so `advance` can diff it.
- `SentryStatus` gains `canArm` and `canDisarm`, so no screen reads `sentry.mode`.
- `KEEP.days` is 31. Battery thresholds are one named table for the Seal's lithium iron phosphate 12V battery, not a table per chemistry.
- `ui-tests/support.mjs`, `format.test.mjs` and `config.test.mjs` already exist. `conformance.test.mjs` also checks that no text size token is under 20 px and that every interactive control class sets a 72 px minimum.


Plain ES modules for Chromium 74 and Node 22. Every body throws `not implemented`. Types are JSDoc and nothing checks them, so each union below has exactly one constructing module, the one it is declared in. Units are in the type names: Millis is epoch milliseconds, and Volts, Pct, Kpa and Celsius are plain numbers in those units.

## Module map

`sealguard/app/assets/ui/`

| File | Responsibility |
|---|---|
| `index.html` | The only entry: links tokens.css and app.css, boots main.js with the native bridge when `window.SealGuardHost` exists and with sim.js otherwise, so the car and tools/screenshot-ui.sh load the same page. |
| `tokens.css` | Every DESIGN.md token as a custom property: type scale, dark colors by default and light under `[data-theme=light]`, radii, spacing, the 72 px touch target, motion set to 0ms under reduced motion. |
| `app.css` | Layout and components built only from tokens: 420 px sidebar in landscape, tab bar in portrait, sheet geometry per orientation, solid bars where backdrop-filter is missing, one color per tone. |
| `icons.svg` | In-house symbol sprite for navigation, triggers and actions. |
| `fonts/Inter.woff2` | Already bundled Inter variable font; titles ask for the Display optical size through font-variation-settings and get the text cut if the subset lacks that axis. |
| `fonts/LICENSE.txt` | Already bundled OFL license, linked from Settings, About. |
| `main.js` | The hub: World, `initialWorld` and `advance`. |
| `app.js` | The DOM-free `createApp` loop: load, connect, tick, persist by reference change, run effects. |
| `boot.js` | Mounts navigation and screens, turns load and hashchange into view intents, applies theme and reduced motion, renders once per frame after a change. |
| `format.js` | Owner-facing numbers and times. Already implemented. |
| `host.js` | The boundary: native bridge adapter, total parser for inbound text, command encoder. |
| `sim.js` | Deterministic host: scripted scenarios on virtual time with seeded noise, speaking the car's JSON and obeying every command. |
| `config.js` | The FIELDS table, total parser, one-key load and save. Already implemented. |
| `telemetry.js` | Snapshot history at two resolutions: retention, windows, trend fit, per-day persistence. |
| `sentry.js` | Sentry state machine over config and clock only: `step` and the status every screen shows. |
| `parking.js` | Runtime budget and the time-lapse plan. |
| `battery.js` | 12V battery health. |
| `tyres.js` | Tyre slow-leak detection. |
| `recordings.js` | Recorded events: incident pack, retention, day-grouped timeline. |
| `ui.js` | DOM component kit; touches the DOM only when called. |
| `screens/dashboard.js` | Hero card with sentry tone and title, armed time, 12V, runtime, time-lapse cadence, mosaic thumbnail, arm button. |
| `screens/events.js` | Day-grouped timeline, trigger filter, event sheet with the 2x2 player, export and delete. |
| `screens/cameras.js` | Live 2x2 mosaic; tapping a quadrant enlarges that camera. |
| `screens/car.js` | 12V health with the nightly trend, tyre pressures with the leak flag, charging state. |
| `screens/settings.js` | Grouped inset lists built from FIELDS, the retention confirmation sheet, About. |
| `screens/diagnostics.js` | Camera ids and fps, power level, voltages, self-test, link health, kill switch. |
| `screens/onboarding.js` | First run: what sentry does, the autostart step, the arming rule, done. |

`sealguard/ui-tests/`

| File | What it proves |
|---|---|
| `support.mjs` | Memory storage (exists), fake bridge, fixed clock, snapshot and state builders; pins TZ to Asia/Bangkok so day grouping is stable. |
| `format.test.mjs` | Exists. |
| `host.test.mjs` | Every message kind parses; malformed, out-of-range, wrong-version and disallowed-URL input becomes `rejected`; commands encode. |
| `config.test.mjs` | Exists. parseConfig is total; a stored value cut at every byte offset still loads as a valid Config. |
| `telemetry.test.mjs` | Downsampling, kept transitions, dropped out-of-order samples, stable `kept` reference, per-day round trip. |
| `sentry.test.mjs` | Transition table, refused requests, startup adoption, and a seeded property test that no input sequence builds a forbidden state or command. |
| `parking.test.mjs` | Budget from this park, from past parks, while learning and while charging; lapse bands. |
| `battery.test.mjs` | Good, watch, replace and learning from synthetic nights, sag included. |
| `tyres.test.mjs` | Temperature compensation; the leaking tyre flagged against its siblings; drift shared by all four not flagged. |
| `recordings.test.mjs` | Pack schema and window, retention, day grouping. |
| `app.test.mjs` | Scenarios end to end through createApp and sim.js: a night that halts, a slow leak, a reload mid-recording, the kill switch. |
| `screens.test.mjs` | Every screen model over representative worlds, including the hero tone for each sentry mode. |
| `conformance.test.mjs` | Fails on syntax or CSS newer than Chromium 74, color or size literals in app.css, text under 20 px, a logic module importing ui.js or a screen, a module touching the DOM at import. |

tools/run-tests.sh already runs `node --test ui-tests/*.test.mjs`. The `.mjs` tests import the page's `.js` modules, which Node 22.22 detects as ES modules with no package.json; verified in this sandbox.

## host.js

```js
/** @typedef {'front'|'rear'|'left'|'right'} CameraId */
/** @typedef {'motion'|'impact'} Trigger */
/** @typedef {string} SessionId  'p' + the at of the power-off sample that began the park, so a reload derives the same id */
/** @typedef {string} ClipId  'c' + startedAt; the saved event keeps it as its EventId */
/** @typedef {ClipId} EventId */
/** @typedef {{id: ClipId, trigger: Trigger, cameras: CameraId[], startedAt: Millis, lastSeenAt: Millis}} Clip */
/** @typedef {{url: string, layout: CameraId[]}} Mosaic  one composite stream or file; layout names the quadrants in reading order */
/** @typedef {{version: string, killed: boolean, theme: 'dark'|'light', autostart: 'allowed'|'blocked'|'unknown', watch: {session: SessionId, since: Millis}|null, recording: Clip|null,
 *   lapse: {session: SessionId, intervalS: number}|null, cameras: {id: CameraId, fps: number}[], mosaic: Mosaic|null, selfTest: {name: string, ok: boolean, detail: string}[]}} HostStatus
 * watch, recording and lapse echo the last commands the host obeyed, which is what lets a reload adopt them. */
/**
 * @typedef {{kind: 'vehicle', snapshot: VehicleSnapshot}
 *   | {kind: 'detection', at: Millis, trigger: Trigger, cameras: CameraId[], score: number}
 *   | {kind: 'status', status: HostStatus}
 *   | {kind: 'events', events: RecordedEvent[]}
 *   | {kind: 'exported', id: EventId, ok: boolean, where: string}
 *   | {kind: 'rejected', reason: string}} HostInput
 */
/**
 * @typedef {{kind: 'hello'}
 *   | {kind: 'startWatch', session: SessionId, since: Millis, deterrent: boolean} | {kind: 'stopWatch', session: SessionId}
 *   | {kind: 'startRecording', clip: Clip, preRollS: number} | {kind: 'stopRecording', clip: ClipId}
 *   | {kind: 'saveEvent', event: EventCore, pack: string} | {kind: 'deleteEvents', ids: EventId[]}
 *   | {kind: 'startLapse', session: SessionId, intervalS: number} | {kind: 'stopLapse', session: SessionId}
 *   | {kind: 'exportEvent', id: EventId} | {kind: 'setKill', on: boolean} | {kind: 'openAutostart'}} Command
 * Every command names what it acts on so the host treats a repeat as a no-op. startLapse for a running
 * session only changes the interval, which is what keeps one time-lapse clip per park.
 */
/** @typedef {{send: (text: string) => void, listen: (fn: (text: string) => void) => void}} Bridge */
/** @typedef {{now: () => Millis, every: (ms: number, fn: () => void) => void}} Clock */

/** Adapts window.SealGuardHost.post and window.sealguardReceive to a Bridge. @param {Window} win @returns {Bridge} */
export function nativeBridge(win) { throw new Error('not implemented'); }
/** Parses each bridge text exactly once into a HostInput for onInput and returns the command sender; parsing never throws. @param {Bridge} bridge @param {Clock} clock @param {(input: HostInput) => void} onInput @returns {(command: Command) => void} */
export function connectHost(bridge, clock, onInput) { throw new Error('not implemented'); }
```

## telemetry.js

```js
/** @typedef {number} Millis */ /** @typedef {number} Volts */ /** @typedef {number} Pct */ /** @typedef {number} Kpa */ /** @typedef {number} Celsius */
/** @typedef {'fl'|'fr'|'rl'|'rr'} Wheel */
/** @typedef {{state: 'unplugged'} | {state: 'plugged'} | {state: 'charging', kw: number, dc: boolean}} Charge */
/** @typedef {{at: Millis, power: 'off'|'acc'|'on', locked: boolean, charge: Charge, v12: Volts, v12Low: boolean, hvV: Volts, soc: Pct,
 *   tyres: Record<Wheel, {kpa: Kpa, tempC: Celsius}>|null}} VehicleSnapshot  v12Low is the car's own 12V LOW callback; tyres is null while the TPMS sleeps */
/** @typedef {{latest: VehicleSnapshot|null, recent: VehicleSnapshot[], kept: VehicleSnapshot[]}} History  kept changes reference only when a sample is kept, which is how createApp knows to persist */
/** @typedef {{slope: number, intercept: number, n: number}} Fit */
/** @typedef {{getItem(k: string): string|null, setItem(k: string, v: string): void, removeItem(k: string): void, key(i: number): string|null, length: number}} StorageLike */

/** Retention policy; battery.js reads afterTransitionMs as its sag window so the two cannot drift. */
export const KEEP = { recentMs: 10 * 60e3, everyMs: 10 * 60e3, afterTransitionMs: 15e3, days: 31 };
/** @type {History} */
export const EMPTY_HISTORY = { latest: null, recent: [], kept: [] };

/** Adds one snapshot, drops out-of-order ones, keeps every power, lock and charge transition and the window after a power change. @param {History} history @param {VehicleSnapshot} snapshot @returns {History} */
export function record(history, snapshot) { throw new Error('not implemented'); }
/** Snapshots at or after from, kept and recent merged in time order. @param {History} history @param {Millis} from @returns {VehicleSnapshot[]} */
export function since(history, from) { throw new Error('not implemented'); }
/** Start of the current park, or null when the latest snapshot is not parked. @param {History} history @returns {Millis|null} */
export function lastParkedAt(history) { throw new Error('not implemented'); }
/** Least-squares line through the points; null under three points. @param {[number, number][]} points @returns {Fit|null} */
export function trend(points) { throw new Error('not implemented'); }
/** Reads every per-day key, drops invalid tuples and stale days, returns history with kept filled. @param {StorageLike} storage @param {Millis} now @returns {History} */
export function loadHistory(storage, now) { throw new Error('not implemented'); }
/** Rewrites only the day key of the newest kept sample and prunes old days; false when storage refuses. @param {StorageLike} storage @param {History} history @returns {boolean} */
export function saveHistory(storage, history) { throw new Error('not implemented'); }
```

## config.js

Implemented. Read `sealguard/app/assets/ui/config.js` for `FIELDS`, `parseConfig`, `loadConfig` and `saveConfig`. The Config keys are arming, sensitivity, preRollS, deterrent, socFloor, v12Floor, retentionDays, lapse, appearance, reduceMotion and onboarded.

## sentry.js

```js
/** @typedef {{id: SessionId, at: Millis}} Park */
/** @typedef {{park: Park, lapseS: number|null, lowSince: Millis|null}} Parked  lowSince marks when a floor was first crossed in the current dip */
/**
 * @typedef {{mode: 'starting', snapshot: VehicleSnapshot|null, status: HostStatus|null}
 *   | {mode: 'driving'}
 *   | {mode: 'off'}
 *   | ({mode: 'idle'} & Parked)
 *   | ({mode: 'armed', armedAt: Millis} & Parked)
 *   | ({mode: 'recording', armedAt: Millis, clip: Clip} & Parked)
 *   | {mode: 'halted', park: Park, reason: 'v12'|'soc', value: number, at: Millis}} SentryState
 * starting waits for one snapshot and one status and decides once. driving has no armed variant and
 * recording always carries armedAt, so armed-while-driving and recording-while-disarmed cannot be built.
 * halted carries no lapseS, so a time-lapse cannot outlive a floor stop.
 */
/** @typedef {Extract<Input, {kind: 'vehicle'|'detection'|'status'|'tick'|'arm'|'disarm'|'setConfig'}>} SentryInput */
/** @typedef {'armed'|'recording'|'alert'|'disarmed'} Tone  the DESIGN.md status mapping; only app.css turns a tone into a color */
/** @typedef {{kind: 'alert', tone: Tone, title: string, body: string}} Alert */
/** @typedef {Extract<Command, {kind: 'startWatch'|'stopWatch'|'startRecording'|'stopRecording'}> | {kind: 'clipClosed', event: EventCore} | Alert} SentryEffect
 *   clipClosed is sentry's own word; advance turns it into saveEvent with the pack, so the pack format never enters this module */
/** @typedef {{state: SentryState, effects: SentryEffect[]}} Transition */
/** @typedef {{tone: Tone, title: string, detail: string, since: Millis|null, canArm: boolean, canDisarm: boolean}} SentryStatus */

/** @type {SentryState} */
export const INITIAL_SENTRY = { mode: 'starting', snapshot: null, status: null };

/** The only constructor of SentryState: applies one input and returns the next state and the effects the hub must run; a request it cannot honor returns the same state plus an alert that says why. @param {SentryState} state @param {SentryInput} input @param {Config} config @param {Millis} now @returns {Transition} */
export function step(state, input, config, now) {
  // TODO status killed => off, saving any open clip; off plus a status not killed => starting.
  // TODO starting holds a snapshot and a status; with both, acc or on => driving, else park with id 'p' + the power-off at,
  //      adopt status.watch and recording, then apply the arming rule. Later statuses re-send what the host lost.
  // TODO acc or on from a parked mode => driving with stopRecording, clipClosed, stopWatch.
  // TODO off from driving => park; the arming rule picks idle or armed with startWatch.
  //      Rule locked: lock arms, unlock returns to idle and closes the clip.
  // TODO v12 under v12Floor or soc at or under socFloor sets lowSince; held 30 s, or v12Low at once => halted, closing
  //      clip and watch, with an alert. Holding exists because a one-second sag must not end sentry for the night.
  // TODO armed plus impact, or motion at or over the sensitivity threshold => recording, startRecording, alert.
  // TODO tick while recording, 10 s quiet or 5 min long => stopRecording, clipClosed => armed.
  // TODO arm while armed is a silent no-op; arm from driving, halted, off or starting => same state plus an alert saying why.
  // TODO setConfig re-applies the rule; halted resumes when the latest reading clears the new floor.
  throw new Error('not implemented');
}
/** What the hero card, the sidebar badge and the night surface show for a state. @param {SentryState} state @param {Config} config @param {Millis} now @returns {SentryStatus} */
export function sentryStatus(state, config, now) { throw new Error('not implemented'); }
```

## parking.js

```js
/**
 * @typedef {{kind: 'learning', reason: string} | {kind: 'charging', reason: string}
 *   | {kind: 'estimate', hours: number, limitedBy: 'soc'|'v12', basis: 'thisPark'|'pastParks', reason: string}} RuntimeBudget
 */
/** @typedef {{kind: 'off', reason: string} | {kind: 'run', intervalS: number, reason: string}} LapsePlan */

/** Hours until the first floor is reached, from this park's measured draw once 30 min are in, else the median draw of the last seven parks. @param {History} history @param {Config} config @param {Millis} now @returns {RuntimeBudget} */
export function runtimeBudget(history, config, now) { throw new Error('not implemented'); }
/** Frame interval for this park's single clip, snapped to fixed bands so small budget changes never touch the host; off when disabled or under two hours of budget. @param {RuntimeBudget} budget @param {Config} config @returns {LapsePlan} */
export function lapsePlan(budget, config) { throw new Error('not implemented'); }
```

## battery.js

```js
/**
 * @typedef {{verdict: 'learning', reason: string, nights: {at: Millis, volts: Volts}[]}
 *   | {verdict: 'good'|'watch'|'replace', reason: string, nights: {at: Millis, volts: Volts}[], restingV: Volts, slopePerDay: number, sagV: Volts|null}} BatteryHealth
 */
/** Judges the 12V battery from nightly resting voltage, taken two hours into a park with no charging, and from the sag after each wake; thresholds are one named table for the lithium iron phosphate 12V battery. @param {History} history @param {Millis} now @returns {BatteryHealth} */
export function assessBattery(history, now) { throw new Error('not implemented'); }
```

## tyres.js

```js
/** @typedef {{wheel: Wheel, kpa20: Kpa, kpaPerWeek: number}} TyreTrend  kpa20 is cold pressure compensated to 20 degrees C */
/** @typedef {{verdict: 'learning', reason: string} | {verdict: 'steady', reason: string, tyres: TyreTrend[]} | {verdict: 'leak', reason: string, wheel: Wheel, tyres: TyreTrend[]}} TyreHealth */

/** Fits each tyre's compensated cold pressure over 21 days and flags the one falling faster than its siblings' median by over 5 kPa a week; comparing siblings cancels weather. @param {History} history @param {Millis} now @returns {TyreHealth} */
export function assessTyres(history, now) { throw new Error('not implemented'); }
```

## recordings.js

```js
/** @typedef {{id: EventId, trigger: Trigger, cameras: CameraId[], startedAt: Millis, endedAt: Millis}} EventCore */
/** @typedef {EventCore & {clipUrl: string, thumbUrl: string, layout: CameraId[]}} RecordedEvent */
/** @typedef {{schema: 'sealguard.incident/1', event: EventCore, telemetry: VehicleSnapshot[], app: string}} IncidentPack */
/** @typedef {{label: string, events: RecordedEvent[]}} DayGroup */

/** Serializes a closing clip with the telemetry from pre-roll before its start to its end; called at close because only then is that window certain to be in memory. @param {EventCore} event @param {History} history @param {number} preRollS @returns {string} */
export function incidentPack(event, history, preRollS) { throw new Error('not implemented'); }
/** Ids of events older than the retention window. @param {RecordedEvent[]} events @param {number} retentionDays @param {Millis} now @returns {EventId[]} */
export function expiredEvents(events, retentionDays, now) { throw new Error('not implemented'); }
/** Newest-first local-day groups filtered by trigger and labelled Today, Yesterday or a date. @param {RecordedEvent[]} events @param {Trigger|'all'} filter @param {Millis} now @returns {DayGroup[]} */
export function timeline(events, filter, now) { throw new Error('not implemented'); }
```

## main.js

```js
/** @typedef {'dashboard'|'events'|'cameras'|'car'|'settings'|'diagnostics'|'onboarding'} Route  parsed from location.hash, which is a boundary like any other */
/** @typedef {{kind: 'event', id: EventId} | {kind: 'retention', days: number}} Sheet */
/** @typedef {{route: Route, filter: Trigger|'all', sheet: Sheet|null, focus: CameraId|null, step: number}} ViewState  only boot writes route, from the hash; step is the onboarding page */
/**
 * @typedef {{kind: 'arm'} | {kind: 'disarm'} | {kind: 'setConfig', patch: Partial<Config>}
 *   | {kind: 'kill', on: boolean} | {kind: 'export', id: EventId} | {kind: 'delete', id: EventId}
 *   | {kind: 'openAutostart'} | {kind: 'view', patch: Partial<ViewState>}} Intent
 */
/** @typedef {HostInput | Intent | {kind: 'tick'}} Input */
/** @typedef {Command | Alert} Effect  what advance returns for app.js to run */
/** @typedef {{config: Config, history: History, sentry: SentryState, lapse: {session: SessionId, intervalS: number}|null, host: HostStatus|null, events: RecordedEvent[],
 *   link: {heardAt: Millis|null, rejected: number, lastError: string}, view: ViewState}} World  lapse is the last lapse command sent, so advance can diff the plan against it */
/** @typedef {{bridge: Bridge, clock: Clock, storage: StorageLike, onAlert: (alert: Extract<Effect, {kind: 'alert'}>) => void}} AppOptions */
/** @typedef {{dispatch: (input: Input) => void, world: () => World, subscribe: (fn: () => void) => void}} App */
/** @template M @typedef {{route: Route, title: string, icon: string, model: (world: World, now: Millis) => M,
 *   mount: (root: HTMLElement, dispatch: (intent: Intent) => void) => {update: (m: M) => void, hide: () => void}}} Screen
 * model decides every word, number and tone; update only copies them into nodes; hide stops streams. */

/** The World before any host message. @param {Config} config @param {History} history @returns {World} */
export function initialWorld(config, history) { throw new Error('not implemented'); }
/** The only writer of World: routes one input to its owning module, turns clipClosed into saveEvent with the pack, diffs the lapse plan against world.lapse, and returns the next World and the effects to run. @param {World} world @param {Input} input @param {Millis} now @returns {{world: World, effects: Effect[]}} */
export function advance(world, input, now) { throw new Error('not implemented'); }
```

## app.js

```js
/** DOM-free runtime: loads config and history, connects the host, ticks each second, persists slices whose reference changed, runs effects. @param {AppOptions} opts @returns {App} */
export function createApp(opts) {
  // TODO inputs arriving while effects run are queued and applied in order, so no host can interleave two advances.
  throw new Error('not implemented');
}
```

## boot.js

```js
/** Mounts navigation and screens, turns load and hashchange into view intents so the head unit's back button walks hash history, applies theme, reduced motion and the night surface, renders once per frame after a change. @param {Window} win @param {Bridge} bridge @param {Clock} [clock] */
export function boot(win, bridge, clock) { throw new Error('not implemented'); }
```

## sim.js

```js
/** @typedef {{bridge: Bridge, clock: Clock, advanceBy: (ms: number) => void}} Sim */

/** Deterministic host for the sandbox, the screenshots and the tests: night, leak, healthy and charging scenarios on virtual time with seeded noise. It replies on its own clock, never inside send; it backfills past days sparsely and densely only around power changes so a world is populated within the screenshot runner's 300 ms wait; its media are SVG data URLs so no load ever fails. @param {'night'|'prowler'|'leak'|'healthy'|'charging'} scenario @param {number} seed @param {'dark'|'light'} theme @returns {Sim} */
export function createSimulator(scenario, seed, theme) { throw new Error('not implemented'); }
```

## ui.js

```js
/** @typedef {{el: HTMLElement, set: (value: any) => void}} Control */
/** @typedef {{label: string, detail: string, control: Control|null, onTap: (() => void)|null, tone: string|null}} Row */
/** @typedef {{header: string, footer: string, rows: Row[]}} Section */

/** Element builder; attributes named on-something become listeners. @param {string} tag @param {Object} attrs @param {(Node|string)[]} [children] @returns {HTMLElement} */
export function h(tag, attrs, children) { throw new Error('not implemented'); }
/** Plain links to #/route that CSS lays out as the landscape sidebar or the portrait tab bar; select marks the current one. @param {Screen<any>[]} screens @returns {{el: HTMLElement, select: (route: Route) => void}} */
export function navigation(screens) { throw new Error('not implemented'); }
/** Navigation bar whose large title shrinks into the bar once an IntersectionObserver sentinel leaves the top. @param {HTMLElement} scroller @param {string} title @returns {HTMLElement} */
export function largeTitle(scroller, title) { throw new Error('not implemented'); }
/** Grouped inset list: uppercase footnote headers, footnote footers, 84 px rows, separators inset to the text. @param {Section[]} sections @returns {HTMLElement} */
export function insetList(sections) { throw new Error('not implemented'); }
/** 78 by 48 px switch. @param {(on: boolean) => void} onChange @returns {Control} */
export function toggle(onChange) { throw new Error('not implemented'); }
/** 60 px pill segmented control. @param {{value: string|number, label: string}[]} options @param {(value: any) => void} onChange @returns {Control} */
export function segmented(options, onChange) { throw new Error('not implemented'); }
/** Stepper bounded by a range FieldSpec from FIELDS, so it can only emit values parseConfig keeps. @param {FieldSpec} spec @param {(v: number) => string} format @param {(v: number) => void} onChange @returns {Control} */
export function stepper(spec, format, onChange) { throw new Error('not implemented'); }
/** Bottom sheet in portrait, centered card in landscape; destructive actions last and red. @param {() => void} onClose @returns {{el: HTMLElement, open: (content: Node) => void, close: () => void}} */
export function sheet(onClose) { throw new Error('not implemented'); }
/** Composite stream or clip, cropped to one quadrant when focused; hide clears src so the stream stops. @param {'img'|'video'} kind @param {((camera: CameraId|null) => void)|null} onFocus @returns {{el: HTMLElement, set: (source: Mosaic|null, focus: CameraId|null) => void, hide: () => void}} */
export function mosaic(kind, onFocus) { throw new Error('not implemented'); }
/** Inline SVG line for the nightly 12V trend. @returns {Control} */
export function sparkline() { throw new Error('not implemented'); }
/** Banner in the alert's tone that dismisses itself. @param {Document} doc @param {{tone: Tone, title: string, body: string}} alert */
export function showAlert(doc, alert) { throw new Error('not implemented'); }
/** Reconciles parent's children to items by key: creates, moves and updates in place so unchanged rows keep their nodes. @template T @param {HTMLElement} parent @param {T[]} items @param {(item: T) => string} keyOf @param {(item: T) => HTMLElement} create @param {(el: HTMLElement, item: T) => void} update */
export function syncList(parent, items, keyOf, create, update) { throw new Error('not implemented'); }
```

## screens

Each file exports one `Screen`. Models are pure and tested in Node; mounts build DOM once.

```js
// screens/dashboard.js
/** @typedef {{tone: Tone, title: string, detail: string, armedFor: string, v12: string, runtime: string, runtimeWhy: string, lapse: string, mosaic: Mosaic|null, canArm: boolean, canDisarm: boolean}} DashboardModel */
export const dashboard = { route: 'dashboard', title: 'Dashboard', icon: 'shield',
  /** Hero facts from sentryStatus, runtimeBudget, lapsePlan, the latest 12V and the live mosaic. @param {World} world @param {Millis} now @returns {DashboardModel} */
  model(world, now) { throw new Error('not implemented'); },
  /** Builds the hero card once; update sets data-tone and copies text and stream. @param {HTMLElement} root @param {(i: Intent) => void} dispatch */
  mount(root, dispatch) { throw new Error('not implemented'); } };

// screens/events.js
/** @typedef {{id: EventId, time: string, trigger: Trigger, cameras: string, duration: string, thumbUrl: string}} EventRow */
/** @typedef {{filter: Trigger|'all', groups: {label: string, rows: EventRow[]}[], empty: string, sheet: {id: EventId, title: string, player: Mosaic, focus: CameraId|null}|null}} EventsModel */
export const events = { route: 'events', title: 'Events', icon: 'film',
  /** Timeline from recordings.js timeline under view.filter, and the open sheet. @param {World} world @param {Millis} now @returns {EventsModel} */
  model(world, now) { throw new Error('not implemented'); },
  /** Filter segments, keyed rows, and the sheet with the video mosaic, Export incident pack, and Delete in red. @param {HTMLElement} root @param {(i: Intent) => void} dispatch */
  mount(root, dispatch) { throw new Error('not implemented'); } };

// screens/cameras.js
/** @typedef {{mosaic: Mosaic|null, focus: CameraId|null, cameras: {id: CameraId, label: string, fps: string}[], offline: string}} CamerasModel */
export const cameras = { route: 'cameras', title: 'Cameras', icon: 'camera',
  /** Live mosaic, focused quadrant and per-camera labels. @param {World} world @param {Millis} now @returns {CamerasModel} */
  model(world, now) { throw new Error('not implemented'); },
  /** Full-width image mosaic; a tap dispatches view focus. @param {HTMLElement} root @param {(i: Intent) => void} dispatch */
  mount(root, dispatch) { throw new Error('not implemented'); } };

// screens/car.js
/** @typedef {{level: 'good'|'watch'|'act'|'unknown', verdict: string, reason: string}} Finding */
/** @typedef {{battery: Finding, nights: number[], tyres: {wheel: Wheel, kpa: string, trend: string, flagged: boolean}[], tyreFinding: Finding, charge: string}} CarModel */
export const car = { route: 'car', title: 'Car', icon: 'car',
  /** Findings from assessBattery and assessTyres plus the charging line. @param {World} world @param {Millis} now @returns {CarModel} */
  model(world, now) { throw new Error('not implemented'); },
  /** Battery card with sparkline, four-tyre plan view, charging row. @param {HTMLElement} root @param {(i: Intent) => void} dispatch */
  mount(root, dispatch) { throw new Error('not implemented'); } };

// screens/settings.js
/** @typedef {{config: Config, floorsFooter: string, wouldDelete: Record<number, number>, version: string}} SettingsModel */
export const settings = { route: 'settings', title: 'Settings', icon: 'gear',
  /** Current values, the runtime at the chosen floors, and how many events each retention choice would delete. @param {World} world @param {Millis} now @returns {SettingsModel} */
  model(world, now) { throw new Error('not implemented'); },
  /** Inset lists whose controls come from FIELDS; each change dispatches setConfig. @param {HTMLElement} root @param {(i: Intent) => void} dispatch */
  mount(root, dispatch) { throw new Error('not implemented'); } };

// screens/diagnostics.js
/** @typedef {{rows: {label: string, value: string, ok: boolean|null}[], selfTest: {name: string, ok: boolean, detail: string}[], killed: boolean}} DiagnosticsModel */
export const diagnostics = { route: 'diagnostics', title: 'Diagnostics', icon: 'wrench',
  /** Camera ids and fps, power level, 12V and HV voltages, SoC, link health, self-test, kill state. @param {World} world @param {Millis} now @returns {DiagnosticsModel} */
  model(world, now) { throw new Error('not implemented'); },
  /** Read-only rows and the kill switch, which dispatches kill and shows the host's confirmed state. @param {HTMLElement} root @param {(i: Intent) => void} dispatch */
  mount(root, dispatch) { throw new Error('not implemented'); } };

// screens/onboarding.js
/** @typedef {{step: number, autostart: 'allowed'|'blocked'|'unknown', arming: string}} OnboardingModel */
export const onboarding = { route: 'onboarding', title: 'Welcome', icon: 'shield',
  /** Page index, the host's autostart reading and the chosen rule; shown while config.onboarded is false and at #/onboarding. @param {World} world @param {Millis} now @returns {OnboardingModel} */
  model(world, now) { throw new Error('not implemented'); },
  /** Four pages; Open car settings dispatches openAutostart; Done dispatches setConfig with onboarded true. @param {HTMLElement} root @param {(i: Intent) => void} dispatch */
  mount(root, dispatch) { throw new Error('not implemented'); } };
```
