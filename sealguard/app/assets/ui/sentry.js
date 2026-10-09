// Sentry: a machine over parking sessions, driven by config and the clock alone. step is the only constructor of a
// SentryState, so armed-while-driving and recording-while-disarmed cannot be built; sentryStatus is every word a screen shows for it.
import { fmt } from './format.js';

/** @typedef {{id: SessionId, at: Millis}} Park */
/** @typedef {{park: Park, reading: VehicleSnapshot, lowSince: Millis|null, lastClipAt: Millis|null}} Parked  reading is the latest snapshot, which the rules consult when config changes; lowSince marks when a floor was first crossed in the current dip; lastClipAt is the lastSeenAt of the last clip closed in this park, so a replayed detection cannot reopen it */
/** @typedef {{v12: number, soc: number}} Floors  the floors sentry halted under, so only a changed floor can release it */
/**
 * @typedef {{mode: 'starting', snapshot: VehicleSnapshot|null, status: HostStatus|null}
 *   | {mode: 'driving'}
 *   | {mode: 'off'}
 *   | ({mode: 'idle', disarmed: boolean} & Parked)
 *   | ({mode: 'armed', armedAt: Millis, deterrent: boolean} & Parked)
 *   | ({mode: 'recording', armedAt: Millis, deterrent: boolean, clip: Clip} & Parked)
 *   | ({mode: 'halted', reason: 'v12'|'soc', value: number, at: Millis, floors: Floors} & Parked)} SentryState
 * starting waits for one snapshot and one status and decides once. driving has no armed variant and recording always
 * carries armedAt. deterrent is the value the host was last told, so a changed setting can be re-sent once. idle.disarmed
 * is set by the owner's disarm so the arming rule cannot undo the tap; a fresh lock under the locked rule clears it.
 * halted carries the reading that crossed, the latest one and the floors it halted under, so only a lowered floor the
 * reading clears by a margin can release it.
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
const DRIVING = { mode: 'driving' };
const OFF = { mode: 'off' };

/** Detection score a motion trigger needs at each sensitivity; an impact always records. */
const THRESHOLD = { low: 0.8, medium: 0.5, high: 0.25 };
/** A floor must stay crossed this long before sentry halts, because a one-second sag from a door actuator must not end sentry for the night. */
const HOLD_MS = 30e3;
const QUIET_MS = 10e3;
const MAX_CLIP_MS = 5 * 60e3;
const PARKED_ARM_MS = 60e3;
/** A lowered floor releases a halt only when the reading clears it by this much, so the halt cannot flap on the same sag. */
const RELEASE_MARGIN = { v12: 0.1, soc: 2 };

const HINT = { locked: 'Lock the car to arm', parked: 'Arms a minute after parking', manual: 'Tap Arm to start' };
const DRIVING_HINT = { locked: 'Arms when you park and lock', parked: 'Arms a minute after you park', manual: 'Tap Arm after you park' };
const TRIGGER_WORD = { motion: 'Motion', impact: 'Impact' };

function same(state) { return { state: state, effects: [] }; }
function isParked(state) { return state.mode === 'idle' || state.mode === 'armed' || state.mode === 'recording'; }
function isWatching(state) { return state.mode === 'armed' || state.mode === 'recording'; }
function parkOf(snapshot) { return { id: 'p' + snapshot.at, at: snapshot.at }; }
function parkAt(session, fallback) {
	const n = Number(session.slice(1));
	return session.charAt(0) === 'p' && isFinite(n) && n > 0 ? n : fallback;
}
function eventOf(clip, now) {
	return { id: clip.id, trigger: clip.trigger, cameras: clip.cameras, startedAt: clip.startedAt, endedAt: Math.max(clip.lastSeenAt, now) };
}
function describe(trigger, cameras) {
	const names = cameras.length === 1 ? cameras[0] + ' camera' : cameras.slice(0, -1).join(', ') + ' and ' + cameras[cameras.length - 1] + ' cameras';
	return TRIGGER_WORD[trigger] + ' on the ' + names;
}
function floorLine(reason, value, config) {
	return reason === 'v12'
		? '12V at ' + fmt.volts(value, 2) + ', under the ' + fmt.volts(config.v12Floor) + ' floor'
		: 'Charge at ' + fmt.pct(value) + ', at the ' + fmt.pct(config.socFloor) + ' floor';
}
function alert(tone, title, body) { return { kind: 'alert', tone: tone, title: title, body: body }; }
function floorsOf(config) { return { v12: config.v12Floor, soc: config.socFloor }; }

function closeClip(state, now) {
	return state.mode === 'recording' ? [{ kind: 'stopRecording', id: state.clip.id }, { kind: 'clipClosed', event: eventOf(state.clip, now) }] : [];
}
function stopWatching(state, now) {
	return isWatching(state) ? closeClip(state, now).concat([{ kind: 'stopWatch', session: state.park.id }]) : [];
}
function lastClipOf(base) { return base.mode === 'recording' ? base.clip.lastSeenAt : base.lastClipAt; }
function parked(park, reading, lowSince, lastClipAt) { return { park: park, reading: reading, lowSince: lowSince, lastClipAt: lastClipAt }; }
function idle(base, disarmed) { return { mode: 'idle', park: base.park, reading: base.reading, lowSince: base.lowSince, lastClipAt: lastClipOf(base), disarmed: disarmed }; }
function armed(base, armedAt, deterrent) { return { mode: 'armed', park: base.park, reading: base.reading, lowSince: base.lowSince, lastClipAt: lastClipOf(base), armedAt: armedAt, deterrent: deterrent }; }
function startWatch(state) { return { kind: 'startWatch', session: state.park.id, since: state.armedAt, deterrent: state.deterrent }; }
function arm(state, config, now) {
	const next = armed(state, now, config.deterrent);
	return { state: next, effects: [startWatch(next)] };
}

function crossed(reading, config) {
	if (reading.charge.state === 'charging') return null;
	if (reading.v12 < config.v12Floor) return 'v12';
	if (reading.soc <= config.socFloor) return 'soc';
	return null;
}
function halt(state, reason, config, now) {
	const value = reason === 'v12' ? state.reading.v12 : state.reading.soc;
	const next = { mode: 'halted', park: state.park, reading: state.reading, lowSince: null, lastClipAt: lastClipOf(state), reason: reason, value: value, at: now, floors: floorsOf(config) };
	return { state: next, effects: stopWatching(state, now).concat([alert('alert', 'Stopped to protect the battery', floorLine(reason, value, config))]) };
}
function guardFloors(state, config, now) {
	if (state.reading.v12Low) return halt(state, 'v12', config, now);
	const reason = crossed(state.reading, config);
	if (reason === null) return state.lowSince === null ? same(state) : same(Object.assign({}, state, { lowSince: null }));
	// A clock stepped back would leave the hold negative for as long as the step, so the dip restarts from now.
	if (state.lowSince === null || now < state.lowSince) return same(Object.assign({}, state, { lowSince: now }));
	return now - state.lowSince >= HOLD_MS ? halt(state, reason, config, now) : same(state);
}
function ruleArms(state, config, now) {
	if (state.disarmed) return false;
	if (config.arming === 'locked') return state.reading.locked;
	if (config.arming === 'parked') return now - state.park.at >= PARKED_ARM_MS;
	return false;
}
function settle(state, config, now, effects) {
	const guarded = guardFloors(state, config, now);
	if (guarded.state.mode === 'halted') return { state: guarded.state, effects: effects.concat(guarded.effects) };
	const armedNow = guarded.state.mode === 'idle' && ruleArms(guarded.state, config, now) ? arm(guarded.state, config, now) : same(guarded.state);
	return { state: armedNow.state, effects: effects.concat(guarded.effects, armedNow.effects) };
}

function decide(snapshot, status, config, now) {
	const adoptable = snapshot.power === 'off' && status.watch !== null && !(config.arming === 'locked' && !snapshot.locked);
	const stray = (status.recording !== null && !adoptable ? [{ kind: 'stopRecording', id: status.recording.id }, { kind: 'clipClosed', event: eventOf(status.recording, now) }] : [])
		.concat(status.watch !== null && !adoptable ? [{ kind: 'stopWatch', session: status.watch.session }] : []);
	if (snapshot.power !== 'off') return { state: DRIVING, effects: stray };
	const session = status.watch !== null ? status.watch.session : status.lapse !== null ? status.lapse.session : null;
	const base = parked(session === null ? parkOf(snapshot) : { id: session, at: parkAt(session, snapshot.at) }, snapshot, null, null);
	const start = !adoptable ? idle(base, false)
		: status.recording === null ? armed(base, status.watch.since, config.deterrent)
			: Object.assign(armed(base, status.watch.since, config.deterrent), { mode: 'recording', clip: status.recording });
	// A reload or a kill switch cycle must not restart the hold for a floor that is already crossed, or the cameras run thirty seconds on a flat battery.
	const reason = snapshot.v12Low ? 'v12' : crossed(snapshot, config);
	if (reason !== null) {
		const halted = halt(start, reason, config, now);
		return { state: halted.state, effects: stray.concat(halted.effects) };
	}
	return settle(start, config, now, stray);
}

/** Commands that bring the host's watch and recording back to the state's, so a host restart or a lost command cannot leave the page and the cameras disagreeing all night; a repeat is a no-op by the host contract. */
function reconcile(state, status, config) {
	const watching = isWatching(state);
	const clip = state.mode === 'recording' ? state.clip : null;
	const hostWatch = status.watch;
	const hostClip = status.recording;
	const effects = [];
	if (hostClip !== null && (clip === null || hostClip.id !== clip.id)) effects.push({ kind: 'stopRecording', id: hostClip.id });
	if (hostWatch !== null && (!watching || hostWatch.session !== state.park.id)) effects.push({ kind: 'stopWatch', session: hostWatch.session });
	if (watching && (hostWatch === null || hostWatch.session !== state.park.id)) effects.push(startWatch(state));
	if (clip !== null && (hostClip === null || hostClip.id !== clip.id)) effects.push({ kind: 'startRecording', clip: clip, preRollS: config.preRollS });
	return effects;
}

function onStatus(state, input, config, now) {
	const status = input.status;
	if (status.killed) return state.mode === 'off' ? same(state) : { state: OFF, effects: stopWatching(state, now) };
	if (state.mode === 'off') return same({ mode: 'starting', snapshot: null, status: status });
	if (state.mode === 'starting') return state.snapshot === null ? same({ mode: 'starting', snapshot: null, status: status }) : decide(state.snapshot, status, config, now);
	return { state: state, effects: reconcile(state, status, config) };
}

function onVehicle(state, input, config, now) {
	const s = input.snapshot;
	if (state.mode === 'starting') return state.status === null ? same({ mode: 'starting', snapshot: s, status: null }) : decide(s, state.status, config, now);
	if (state.mode === 'off') return same(state);
	if (state.mode === 'driving') return s.power === 'off' ? settle(idle(parked(parkOf(s), s, null, null), false), config, now, []) : same(state);
	if (state.mode === 'halted') {
		if (s.power !== 'off') return { state: DRIVING, effects: [] };
		if (s.charge.state === 'charging' && state.reading.charge.state !== 'charging') return settle(idle(parked(state.park, s, null, state.lastClipAt), false), config, now, []);
		return same(Object.assign({}, state, { reading: s }));
	}
	if (s.power !== 'off') return { state: DRIVING, effects: stopWatching(state, now) };
	const unlocked = config.arming === 'locked' && state.reading.locked && !s.locked;
	if (unlocked && state.mode !== 'idle') return settle(idle(Object.assign({}, state, { reading: s }), false), config, now, stopWatching(state, now));
	const next = Object.assign({}, state, { reading: s });
	if (state.mode === 'idle') next.disarmed = state.disarmed && !(config.arming === 'locked' && s.locked && !state.reading.locked);
	return settle(next, config, now, []);
}

function onDetection(state, input, config, now) {
	if (input.trigger !== 'impact' && input.score < THRESHOLD[config.sensitivity]) return same(state);
	if (!isWatching(state)) return same(state);
	// A detection the host delayed past the quiet window, or replayed from a clip already closed, would open a clip the host has already saved.
	if (input.at < now - QUIET_MS || (state.lastClipAt !== null && input.at <= state.lastClipAt)) return same(state);
	if (state.mode === 'armed') {
		const clip = { id: 'c' + input.at, trigger: input.trigger, cameras: input.cameras.slice(), startedAt: input.at, lastSeenAt: input.at };
		const next = Object.assign({}, state, { mode: 'recording', clip: clip });
		return { state: next, effects: [{ kind: 'startRecording', clip: clip, preRollS: config.preRollS }, alert('recording', 'Recording', describe(clip.trigger, clip.cameras))] };
	}
	const clip = state.clip;
	const cameras = clip.cameras.concat(input.cameras.filter(function (c) { return clip.cameras.indexOf(c) === -1; }));
	const upgraded = clip.trigger === 'motion' && input.trigger === 'impact';
	const merged = { id: clip.id, trigger: upgraded ? 'impact' : clip.trigger, cameras: cameras, startedAt: clip.startedAt, lastSeenAt: Math.max(clip.lastSeenAt, input.at) };
	return { state: Object.assign({}, state, { clip: merged }), effects: upgraded ? [alert('recording', 'Impact', describe('impact', input.cameras))] : [] };
}

function onTick(state, input, config, now) {
	if (!isParked(state)) return same(state);
	const guarded = guardFloors(state, config, now);
	if (guarded.state.mode === 'halted') return guarded;
	const current = guarded.state;
	if (current.mode === 'recording' && (now - current.clip.lastSeenAt >= QUIET_MS || now - current.clip.startedAt >= MAX_CLIP_MS)) {
		return settle(armed(current, current.armedAt, current.deterrent), config, now, closeClip(current, now));
	}
	return settle(current, config, now, []);
}

function onArm(state, input, config, now) {
	if (state.mode === 'idle') return arm(state, config, now);
	if (state.mode === 'driving') return { state: state, effects: [alert('disarmed', 'Sentry off while driving', 'Park the car to arm sentry.')] };
	if (state.mode === 'halted') return { state: state, effects: [alert('alert', 'Stopped to protect the battery', floorLine(state.reason, state.value, config) + '. Drive or charge to reset.')] };
	if (state.mode === 'off') return { state: state, effects: [alert('disarmed', 'Kill switch on', 'Turn it off in Diagnostics to arm sentry.')] };
	if (state.mode === 'starting') return { state: state, effects: [alert('disarmed', 'Connecting to the car', 'Try again in a moment.')] };
	return same(state);
}

function onDisarm(state, input, config, now) {
	if (!isWatching(state)) return same(state);
	return { state: idle(state, true), effects: stopWatching(state, now) };
}

function clears(reading, config) {
	if (reading.v12Low) return false;
	return reading.v12 >= config.v12Floor + RELEASE_MARGIN.v12 - 1e-9 && reading.soc >= config.socFloor + RELEASE_MARGIN.soc - 1e-9;
}
function onSetConfig(state, input, config, now) {
	if (state.mode === 'halted') {
		const floors = floorsOf(config);
		if (floors.v12 === state.floors.v12 && floors.soc === state.floors.soc) return same(state);
		if (!clears(state.reading, config)) return same(Object.assign({}, state, { floors: floors }));
		return settle(idle(parked(state.park, state.reading, null, state.lastClipAt), false), config, now, []);
	}
	if (isWatching(state) && config.deterrent !== state.deterrent) {
		const next = Object.assign({}, state, { deterrent: config.deterrent });
		return settle(next, config, now, [startWatch(next)]);
	}
	return isParked(state) ? settle(state, config, now, []) : same(state);
}

const STEPS = { status: onStatus, vehicle: onVehicle, detection: onDetection, tick: onTick, arm: onArm, disarm: onDisarm, setConfig: onSetConfig };

/** The only constructor of SentryState: applies one input and returns the next state and the effects the hub must run; a request it cannot honor returns the same state plus an alert that says why. @param {SentryState} state @param {SentryInput} input @param {Config} config @param {Millis} now @returns {Transition} */
export function step(state, input, config, now) {
	const on = Object.prototype.hasOwnProperty.call(STEPS, input.kind) ? STEPS[input.kind] : same;
	return on(state, input, config, now);
}

/** What the hero card, the sidebar badge and the night surface show for a state. @param {SentryState} state @param {Config} config @param {Millis} now @returns {SentryStatus} */
export function sentryStatus(state, config, now) {
	const idleWords = { tone: 'disarmed', since: null, canArm: false, canDisarm: false };
	switch (state.mode) {
		case 'armed': return { tone: 'armed', title: 'Sentry armed', detail: 'Since ' + fmt.time(state.armedAt), since: state.armedAt, canArm: false, canDisarm: true };
		case 'recording': return { tone: 'recording', title: 'Recording', detail: describe(state.clip.trigger, state.clip.cameras), since: state.armedAt, canArm: false, canDisarm: true };
		case 'halted': return Object.assign({}, idleWords, { tone: 'alert', title: 'Stopped to protect the battery', detail: floorLine(state.reason, state.value, config) });
		case 'idle': return Object.assign({}, idleWords, { title: 'Sentry idle', detail: HINT[config.arming], canArm: true });
		case 'driving': return Object.assign({}, idleWords, { title: 'Sentry off while driving', detail: DRIVING_HINT[config.arming] });
		case 'off': return Object.assign({}, idleWords, { title: 'Kill switch on', detail: 'Turn it off in Diagnostics to use sentry' });
		default: return Object.assign({}, idleWords, { title: 'Connecting to the car', detail: 'Waiting for the first reading' });
	}
}
