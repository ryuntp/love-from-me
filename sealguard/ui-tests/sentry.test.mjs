import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, hostStatus, idleState, armedState, recordingState, parkOf, defaults, prng, T0, MINUTE } from './support.mjs';
import { parseConfig } from '../app/assets/ui/config.js';
import { INITIAL_SENTRY, step, sentryStatus } from '../app/assets/ui/sentry.js';

const SENTRY_EFFECTS = ['startWatch', 'stopWatch', 'startRecording', 'stopRecording', 'clipClosed', 'alert'];
const vehicle = (over) => ({ kind: 'vehicle', snapshot: snapshot(over) });
const detection = (over) => Object.assign({ kind: 'detection', at: T0 + MINUTE, trigger: 'motion', cameras: ['front'], score: 0.6 }, over);
const status = (over) => ({ kind: 'status', status: hostStatus(over) });
const tick = { kind: 'tick' };
const arm = { kind: 'arm' };
const disarm = { kind: 'disarm' };
const setConfig = { kind: 'setConfig', patch: {} };
const kinds = (t) => t.effects.map((e) => e.kind);

/** Steps once, then feeds the same input to the result and asserts the state holds and no command repeats. An owner's tap may be answered by the same alert again. */
function twice(state, input, config, now) {
	const first = step(state, input, config, now);
	const again = step(first.state, input, config, now);
	assert.deepEqual(again.state, first.state, 'same input twice keeps the state: ' + input.kind);
	const repeated = input.kind === 'arm' || input.kind === 'disarm' ? again.effects.filter((e) => e.kind !== 'alert') : again.effects;
	assert.deepEqual(repeated, [], 'same input twice adds no effects: ' + input.kind);
	if (input.kind === 'arm' || input.kind === 'disarm') assert.deepEqual(again.effects, first.effects.filter((e) => e.kind === 'alert'), 'a refused tap is answered the same way each time');
	first.effects.forEach((e) => assert.ok(SENTRY_EFFECTS.indexOf(e.kind) >= 0, 'effect kind ' + e.kind));
	return first;
}

test('starting collects one snapshot and one status, in either order, and decides once', () => {
	const afterSnapshot = twice(INITIAL_SENTRY, vehicle(), defaults, T0);
	assert.equal(afterSnapshot.state.mode, 'starting');
	assert.deepEqual(afterSnapshot.effects, []);
	const decided = twice(afterSnapshot.state, status(), defaults, T0);
	assert.equal(decided.state.mode, 'armed', 'locked car under the locked rule arms');
	assert.deepEqual(decided.state.park, parkOf(T0));
	assert.deepEqual(kinds(decided), ['startWatch']);
	assert.deepEqual(decided.effects[0], { kind: 'startWatch', session: 'p' + T0, since: T0, deterrent: false });

	const afterStatus = twice(INITIAL_SENTRY, status(), defaults, T0);
	assert.equal(afterStatus.state.mode, 'starting');
	const decidedLater = twice(afterStatus.state, vehicle({ locked: false }), defaults, T0);
	assert.equal(decidedLater.state.mode, 'idle');
	assert.deepEqual(decidedLater.effects, []);

	const driving = twice(afterStatus.state, vehicle({ power: 'on' }), defaults, T0);
	assert.deepEqual(driving.state, { mode: 'driving' });
	assert.equal(twice(INITIAL_SENTRY, tick, defaults, T0).state, INITIAL_SENTRY);
});

test('starting adopts the host watch and recording so a reload resumes the same clip and armed time', () => {
	const clip = { id: 'c' + (T0 - 20e3), trigger: 'motion', cameras: ['front', 'left'], startedAt: T0 - 20e3, lastSeenAt: T0 - 2e3 };
	const watch = { session: 'p' + (T0 - 2 * 3600e3), since: T0 - 3600e3 };
	const resumed = twice({ mode: 'starting', snapshot: snapshot(), status: null }, status({ watch, recording: clip }), defaults, T0);
	assert.equal(resumed.state.mode, 'recording');
	assert.deepEqual(resumed.state.clip, clip);
	assert.equal(resumed.state.armedAt, watch.since);
	assert.deepEqual(resumed.state.park, { id: watch.session, at: T0 - 2 * 3600e3 });
	assert.deepEqual(resumed.effects, []);

	const armedOnly = twice({ mode: 'starting', snapshot: snapshot(), status: null }, status({ watch }), defaults, T0);
	assert.equal(armedOnly.state.mode, 'armed');
	assert.equal(armedOnly.state.armedAt, watch.since);

	const stray = twice({ mode: 'starting', snapshot: snapshot({ power: 'on' }), status: null }, status({ watch, recording: clip }), defaults, T0);
	assert.equal(stray.state.mode, 'driving');
	assert.deepEqual(kinds(stray), ['stopRecording', 'clipClosed', 'stopWatch']);
	assert.equal(stray.effects[1].event.endedAt, T0);

	const orphan = twice({ mode: 'starting', snapshot: snapshot(), status: null }, status({ recording: clip }), defaults, T0);
	assert.equal(orphan.state.mode, 'armed', 'the locked rule arms afresh');
	assert.deepEqual(kinds(orphan), ['stopRecording', 'clipClosed', 'startWatch']);

	const unlockedUnderLockedRule = twice({ mode: 'starting', snapshot: snapshot({ locked: false }), status: null }, status({ watch }), defaults, T0);
	assert.equal(unlockedUnderLockedRule.state.mode, 'idle');
	assert.deepEqual(kinds(unlockedUnderLockedRule), ['stopWatch']);

	const lapseSession = twice({ mode: 'starting', snapshot: snapshot({ locked: false }), status: null }, status({ lapse: { session: 'p' + (T0 - 1000), intervalS: 30 } }), defaults, T0);
	assert.deepEqual(lapseSession.state.park, { id: 'p' + (T0 - 1000), at: T0 - 1000 });
});

test('the arming rule locked arms on lock and returns to idle, closing any clip, on unlock', () => {
	const idle = idleState({ reading: snapshot({ locked: false }) });
	assert.equal(twice(idle, vehicle({ locked: false }), defaults, T0).state.mode, 'idle');
	const armed = twice(idle, vehicle({ locked: true }), defaults, T0 + 5e3);
	assert.equal(armed.state.mode, 'armed');
	assert.equal(armed.state.armedAt, T0 + 5e3);
	assert.deepEqual(kinds(armed), ['startWatch']);

	const unlocked = twice(recordingState(), vehicle({ locked: false }), defaults, T0 + 2 * MINUTE);
	assert.equal(unlocked.state.mode, 'idle');
	assert.equal(unlocked.state.disarmed, false);
	assert.deepEqual(kinds(unlocked), ['stopRecording', 'clipClosed', 'stopWatch']);
	assert.deepEqual(unlocked.effects[1].event, { id: 'c' + (T0 + MINUTE), trigger: 'motion', cameras: ['front'], startedAt: T0 + MINUTE, endedAt: T0 + 2 * MINUTE });
	assert.deepEqual(kinds(twice(armedState(), vehicle({ locked: false }), defaults, T0)), ['stopWatch']);
});

test('the arming rule parked arms a minute after the park began, locked or not', () => {
	const config = parseConfig({ arming: 'parked' });
	const parked = twice({ mode: 'driving' }, vehicle({ locked: false }), config, T0);
	assert.equal(parked.state.mode, 'idle');
	assert.equal(twice(parked.state, tick, config, T0 + 59e3).state.mode, 'idle');
	const armed = twice(parked.state, tick, config, T0 + 60e3);
	assert.equal(armed.state.mode, 'armed');
	assert.deepEqual(kinds(armed), ['startWatch']);
	assert.equal(twice(armed.state, vehicle({ locked: false, at: T0 + 70e3 }), config, T0 + 70e3).state.mode, 'armed', 'unlock does not disarm under parked');
	assert.equal(twice(parked.state, vehicle({ locked: false, at: T0 + 61e3 }), config, T0 + 61e3).state.mode, 'armed', 'a snapshot also arms once the minute is up');
});

test('the arming rule manual arms only on the arm intent and the lock state changes nothing', () => {
	const config = parseConfig({ arming: 'manual' });
	const parked = twice({ mode: 'driving' }, vehicle(), config, T0);
	assert.equal(parked.state.mode, 'idle');
	assert.equal(twice(parked.state, tick, config, T0 + 10 * MINUTE).state.mode, 'idle');
	assert.equal(twice(parked.state, vehicle({ locked: false }), config, T0).state.mode, 'idle');
	const armed = twice(parked.state, arm, config, T0 + 3e3);
	assert.equal(armed.state.mode, 'armed');
	assert.deepEqual(kinds(armed), ['startWatch']);
	assert.equal(twice(armed.state, vehicle({ locked: false, at: T0 + 4e3 }), config, T0 + 4e3).state.mode, 'armed');
});

test('arm while armed is silent; arm from driving, halted, off or starting keeps the state and says why', () => {
	const silent = twice(armedState(), arm, defaults, T0);
	assert.deepEqual(silent.effects, []);
	assert.equal(twice(recordingState(), arm, defaults, T0).effects.length, 0);
	const halted = { mode: 'halted', park: parkOf(T0), reading: snapshot({ v12: 12.3 }), lowSince: null, reason: 'v12', value: 12.3, at: T0 };
	[[{ mode: 'driving' }, /driving/], [halted, /battery/], [{ mode: 'off' }, /Kill switch/], [INITIAL_SENTRY, /Connecting/]].forEach(([state, title]) => {
		const t = twice(state, arm, defaults, T0);
		assert.deepEqual(t.state, state);
		assert.deepEqual(kinds(t), ['alert']);
		assert.match(t.effects[0].title, title);
		assert.ok(t.effects[0].body.length > 0);
	});
});

test('disarm returns to idle, closes any clip, and holds until the rule sees a new lock', () => {
	const fromArmed = twice(armedState(), disarm, defaults, T0);
	assert.equal(fromArmed.state.mode, 'idle');
	assert.equal(fromArmed.state.disarmed, true);
	assert.deepEqual(kinds(fromArmed), ['stopWatch']);
	const fromRecording = twice(recordingState(), disarm, defaults, T0 + 90e3);
	assert.deepEqual(kinds(fromRecording), ['stopRecording', 'clipClosed', 'stopWatch']);
	assert.equal(fromRecording.effects[1].event.endedAt, T0 + 90e3);

	const stillLocked = twice(fromArmed.state, vehicle({ at: T0 + 10e3 }), defaults, T0 + 10e3);
	assert.equal(stillLocked.state.mode, 'idle', 'the rule does not undo the tap while the car stays locked');
	const unlocked = twice(stillLocked.state, vehicle({ at: T0 + 20e3, locked: false }), defaults, T0 + 20e3);
	assert.equal(unlocked.state.mode, 'idle');
	const relocked = twice(unlocked.state, vehicle({ at: T0 + 30e3, locked: true }), defaults, T0 + 30e3);
	assert.equal(relocked.state.mode, 'armed', 'a fresh lock arms again');

	const config = parseConfig({ arming: 'parked' });
	const parkedDisarm = twice(armedState(), disarm, config, T0 + 2 * MINUTE);
	assert.equal(twice(parkedDisarm.state, tick, config, T0 + 3 * MINUTE).state.mode, 'idle', 'the parked rule stays disarmed for this park');
	assert.equal(twice(parkedDisarm.state, arm, config, T0 + 3 * MINUTE).state.mode, 'armed');
	[{ mode: 'driving' }, { mode: 'off' }, INITIAL_SENTRY, idleState()].forEach((state) => {
		const t = twice(state, disarm, defaults, T0);
		assert.deepEqual(t.state, state);
		assert.deepEqual(t.effects, []);
	});
});

test('sensitivity sets the motion score that records; an impact always records', () => {
	const cases = [['low', 0.79, false], ['low', 0.8, true], ['medium', 0.49, false], ['medium', 0.5, true], ['high', 0.24, false], ['high', 0.25, true]];
	cases.forEach(([sensitivity, score, records]) => {
		const t = twice(armedState(), detection({ score }), parseConfig({ sensitivity }), T0 + MINUTE);
		assert.equal(t.state.mode, records ? 'recording' : 'armed', sensitivity + ' at ' + score);
	});
	['low', 'medium', 'high'].forEach((sensitivity) => {
		const t = twice(armedState(), detection({ trigger: 'impact', score: 0 }), parseConfig({ sensitivity }), T0 + MINUTE);
		assert.equal(t.state.mode, 'recording', 'impact at ' + sensitivity);
	});
	const t = twice(armedState(), detection({ cameras: ['left', 'front'], score: 0.9 }), parseConfig({ preRollS: 5 }), T0 + MINUTE);
	assert.deepEqual(t.state.clip, { id: 'c' + (T0 + MINUTE), trigger: 'motion', cameras: ['left', 'front'], startedAt: T0 + MINUTE, lastSeenAt: T0 + MINUTE });
	assert.equal(t.state.armedAt, T0, 'recording carries armedAt');
	assert.deepEqual(kinds(t), ['startRecording', 'alert']);
	assert.deepEqual(t.effects[0], { kind: 'startRecording', clip: t.state.clip, preRollS: 5 });
	assert.deepEqual(t.effects[1], { kind: 'alert', tone: 'recording', title: 'Recording', body: 'Motion on the left and front cameras' });
	assert.equal(twice(idleState(), detection(), defaults, T0).state.mode, 'idle');
	assert.equal(twice({ mode: 'driving' }, detection(), defaults, T0).state.mode, 'driving');
});

test('a detection during recording extends lastSeenAt and merges cameras; an impact upgrades the trigger once', () => {
	const rec = recordingState();
	const later = twice(rec, detection({ at: T0 + MINUTE + 7e3, cameras: ['rear', 'front'] }), defaults, T0 + MINUTE + 7e3);
	assert.equal(later.state.mode, 'recording');
	assert.deepEqual(later.state.clip.cameras, ['front', 'rear']);
	assert.equal(later.state.clip.lastSeenAt, T0 + MINUTE + 7e3);
	assert.equal(later.state.clip.id, rec.clip.id);
	assert.deepEqual(later.effects, []);
	const weak = twice(rec, detection({ at: T0 + MINUTE + 7e3, score: 0.1 }), defaults, T0 + MINUTE + 7e3);
	assert.deepEqual(weak.state, rec);
	const impact = twice(rec, detection({ at: T0 + MINUTE + 8e3, trigger: 'impact', cameras: ['left'] }), defaults, T0 + MINUTE + 8e3);
	assert.equal(impact.state.clip.trigger, 'impact');
	assert.deepEqual(kinds(impact), ['alert']);
	assert.equal(impact.effects[0].title, 'Impact');
});

test('a recording closes after ten quiet seconds or five minutes and the clip becomes an event', () => {
	const rec = recordingState();
	const open = twice(rec, tick, defaults, rec.clip.lastSeenAt + 9e3);
	assert.equal(open.state.mode, 'recording');
	assert.deepEqual(open.effects, []);
	const quiet = twice(rec, tick, defaults, rec.clip.lastSeenAt + 10e3);
	assert.equal(quiet.state.mode, 'armed');
	assert.equal(quiet.state.armedAt, rec.armedAt);
	assert.deepEqual(kinds(quiet), ['stopRecording', 'clipClosed']);
	assert.deepEqual(quiet.effects[0], { kind: 'stopRecording', clip: rec.clip.id });
	assert.deepEqual(quiet.effects[1].event, { id: rec.clip.id, trigger: 'motion', cameras: ['front'], startedAt: rec.clip.startedAt, endedAt: rec.clip.lastSeenAt + 10e3 });

	const busy = recordingState({ clip: { startedAt: T0 + MINUTE, lastSeenAt: T0 + 6 * MINUTE - 2e3 } });
	const long = twice(busy, tick, defaults, T0 + 6 * MINUTE);
	assert.equal(long.state.mode, 'armed');
	assert.deepEqual(kinds(long), ['stopRecording', 'clipClosed']);
	assert.equal(twice(busy, tick, defaults, T0 + 6 * MINUTE - 1e3).state.mode, 'recording');
});

test('a crossed floor must hold thirty seconds before sentry halts, and a reading back above clears the dip', () => {
	const armed = armedState();
	const dip = twice(armed, vehicle({ at: T0 + 10e3, v12: 12.3 }), defaults, T0 + 10e3);
	assert.equal(dip.state.mode, 'armed');
	assert.equal(dip.state.lowSince, T0 + 10e3);
	assert.deepEqual(dip.effects, []);
	assert.equal(twice(dip.state, tick, defaults, T0 + 39e3).state.mode, 'armed');
	const halted = twice(dip.state, tick, defaults, T0 + 40e3);
	assert.equal(halted.state.mode, 'halted');
	assert.deepEqual(kinds(halted), ['stopWatch', 'alert']);
	assert.equal(halted.state.reason, 'v12');
	assert.equal(halted.state.value, 12.3);
	assert.equal(halted.state.at, T0 + 40e3);
	assert.deepEqual(halted.effects[1], { kind: 'alert', tone: 'alert', title: 'Stopped to protect the battery', body: '12V at 12.3 V, under the 12.4 V floor' });

	const recovered = twice(dip.state, vehicle({ at: T0 + 20e3, v12: 12.6 }), defaults, T0 + 20e3);
	assert.equal(recovered.state.lowSince, null);
	assert.equal(recovered.state.mode, 'armed');
	const laterDip = twice(recovered.state, vehicle({ at: T0 + 50e3, v12: 12.3 }), defaults, T0 + 50e3);
	assert.equal(laterDip.state.lowSince, T0 + 50e3, 'the hold starts over');

	const manual = parseConfig({ arming: 'manual' });
	const socDip = twice(idleState(), vehicle({ at: T0 + 10e3, soc: 20 }), manual, T0 + 10e3);
	assert.equal(socDip.state.lowSince, T0 + 10e3, 'soc at the floor counts');
	assert.equal(socDip.state.mode, 'idle');
	const socHalt = twice(socDip.state, vehicle({ at: T0 + 40e3, soc: 20 }), manual, T0 + 40e3);
	assert.equal(socHalt.state.mode, 'halted');
	assert.equal(socHalt.state.reason, 'soc');
	assert.equal(socHalt.effects[0].body, 'Charge at 20%, at the 20% floor');
	assert.deepEqual(kinds(socHalt), ['alert'], 'idle had nothing to stop');

	const whileRecording = twice(recordingState({ lowSince: T0, reading: snapshot({ v12: 12.3 }) }), tick, defaults, T0 + 30e3);
	assert.deepEqual(kinds(whileRecording), ['stopRecording', 'clipClosed', 'stopWatch', 'alert']);
	assert.equal(twice(armed, vehicle({ at: T0 + 10e3, v12: 12.3, charge: { state: 'charging', kw: 7, dc: false } }), defaults, T0 + 10e3).state.lowSince, null, 'floors are not in play while charging');
});

test('the host 12V low flag halts at once', () => {
	const t = twice(recordingState(), vehicle({ at: T0 + 90e3, v12: 12.9, v12Low: true }), defaults, T0 + 90e3);
	assert.equal(t.state.mode, 'halted');
	assert.equal(t.state.reason, 'v12');
	assert.deepEqual(kinds(t), ['stopRecording', 'clipClosed', 'stopWatch', 'alert']);
	const atStart = twice({ mode: 'driving' }, vehicle({ v12Low: true }), defaults, T0);
	assert.equal(atStart.state.mode, 'halted');
});

test('halted leaves on power, on charging, or on a config whose floors the latest reading clears', () => {
	const low = snapshot({ v12: 12.3 });
	const halted = { mode: 'halted', park: parkOf(T0), reading: low, lowSince: null, reason: 'v12', value: 12.3, at: T0 };
	assert.deepEqual(twice(halted, vehicle({ at: T0 + 10e3, power: 'acc', v12: 12.3 }), defaults, T0 + 10e3).state, { mode: 'driving' });
	const charging = twice(halted, vehicle({ at: T0 + 10e3, v12: 12.3, charge: { state: 'charging', kw: 7, dc: false } }), defaults, T0 + 10e3);
	assert.equal(charging.state.mode, 'armed', 'back to the arming rule');
	assert.deepEqual(kinds(charging), ['startWatch']);
	const stillLow = twice(halted, vehicle({ at: T0 + 10e3, v12: 12.2 }), defaults, T0 + 10e3);
	assert.equal(stillLow.state.mode, 'halted');
	assert.equal(stillLow.state.reading.v12, 12.2);
	assert.equal(stillLow.state.value, 12.3, 'value stays the reading that crossed');
	assert.equal(twice(stillLow.state, setConfig, parseConfig({ v12Floor: 12.3 }), T0 + 20e3).state.mode, 'halted');
	const released = twice(stillLow.state, setConfig, parseConfig({ v12Floor: 12.0 }), T0 + 20e3);
	assert.equal(released.state.mode, 'armed');
	assert.deepEqual(kinds(released), ['startWatch']);
	assert.equal(twice(halted, tick, defaults, T0 + 3600e3).state.mode, 'halted');
	assert.equal(twice(halted, detection(), defaults, T0).state.mode, 'halted');
});

test('acc or on from any parked mode is driving with the clip closed and the watch stopped; off from driving parks', () => {
	const fromRecording = twice(recordingState(), vehicle({ at: T0 + 2 * MINUTE, power: 'on' }), defaults, T0 + 2 * MINUTE);
	assert.deepEqual(fromRecording.state, { mode: 'driving' });
	assert.deepEqual(kinds(fromRecording), ['stopRecording', 'clipClosed', 'stopWatch']);
	assert.deepEqual(kinds(twice(armedState(), vehicle({ power: 'acc' }), defaults, T0)), ['stopWatch']);
	assert.deepEqual(twice(idleState(), vehicle({ power: 'acc' }), defaults, T0), { state: { mode: 'driving' }, effects: [] });
	const parked = twice({ mode: 'driving' }, vehicle({ at: T0 + 5e3, locked: false }), defaults, T0 + 5e3);
	assert.equal(parked.state.mode, 'idle');
	assert.deepEqual(parked.state.park, parkOf(T0 + 5e3));
	assert.equal(twice({ mode: 'driving' }, vehicle({ power: 'on' }), defaults, T0).state.mode, 'driving');
});

test('a killed status moves any state to off, closing a clip first, and a later status returns to starting', () => {
	const fromRecording = twice(recordingState(), status({ killed: true }), defaults, T0 + 90e3);
	assert.deepEqual(fromRecording.state, { mode: 'off' });
	assert.deepEqual(kinds(fromRecording), ['stopRecording', 'clipClosed', 'stopWatch']);
	[{ mode: 'driving' }, idleState(), INITIAL_SENTRY, { mode: 'halted', park: parkOf(T0), reading: snapshot(), lowSince: null, reason: 'soc', value: 20, at: T0 }].forEach((state) => {
		assert.deepEqual(twice(state, status({ killed: true }), defaults, T0), { state: { mode: 'off' }, effects: [] });
	});
	const back = twice({ mode: 'off' }, status(), defaults, T0);
	assert.equal(back.state.mode, 'starting');
	assert.equal(back.state.snapshot, null);
	assert.deepEqual(twice({ mode: 'off' }, vehicle(), defaults, T0), { state: { mode: 'off' }, effects: [] });
	const redecided = twice(back.state, vehicle(), defaults, T0);
	assert.equal(redecided.state.mode, 'armed');
	assert.equal(twice(armedState(), status(), defaults, T0).state.mode, 'armed', 'a routine status changes nothing');
});

test('setConfig re-applies the arming rule and the thresholds', () => {
	const idle = idleState();
	const toLocked = twice(idle, setConfig, parseConfig({ arming: 'locked' }), T0 + 5e3);
	assert.equal(toLocked.state.mode, 'armed');
	const manualIdle = twice(idle, setConfig, parseConfig({ arming: 'manual' }), T0 + 5e3);
	assert.equal(manualIdle.state.mode, 'idle');
	const held = twice(idleState({ disarmed: true }), setConfig, parseConfig({ arming: 'locked' }), T0 + 5e3);
	assert.equal(held.state.mode, 'idle', 'a disarmed owner is not overridden by a settings change');
	const armed = twice(armedState(), setConfig, parseConfig({ arming: 'manual' }), T0);
	assert.equal(armed.state.mode, 'armed', 'changing the rule does not disarm');
	const raised = twice(armedState({ reading: snapshot({ v12: 12.6 }) }), setConfig, parseConfig({ v12Floor: 12.7 }), T0 + 5e3);
	assert.equal(raised.state.lowSince, T0 + 5e3, 'a raised floor starts the hold');
	assert.deepEqual(twice({ mode: 'driving' }, setConfig, defaults, T0), { state: { mode: 'driving' }, effects: [] });
});

test('sentryStatus words, tones, since and the arm and disarm choices', () => {
	const words = (state, config) => sentryStatus(state, config || defaults, T0 + 2 * MINUTE);
	assert.deepEqual(words(armedState()), { tone: 'armed', title: 'Sentry armed', detail: 'Since 21:00', since: T0, canArm: false, canDisarm: true });
	const rec = words(recordingState({ clip: { trigger: 'impact', cameras: ['rear', 'right'] } }));
	assert.deepEqual(rec, { tone: 'recording', title: 'Recording', detail: 'Impact on the rear and right cameras', since: T0, canArm: false, canDisarm: true });
	const halted = words({ mode: 'halted', park: parkOf(T0), reason: 'v12', value: 12.1, at: T0 });
	assert.deepEqual(halted, { tone: 'alert', title: 'Stopped to protect the battery', detail: '12V at 12.1 V, under the 12.4 V floor', since: null, canArm: false, canDisarm: false });
	assert.equal(words({ mode: 'halted', park: parkOf(T0), reason: 'soc', value: 18, at: T0 }, parseConfig({ socFloor: 20 })).detail, 'Charge at 18%, at the 20% floor');
	assert.deepEqual(words({ mode: 'driving' }), { tone: 'disarmed', title: 'Sentry off while driving', detail: 'Arms when you park and lock', since: null, canArm: false, canDisarm: false });
	assert.deepEqual(words({ mode: 'idle', park: parkOf(T0), lowSince: null }), { tone: 'disarmed', title: 'Sentry idle', detail: 'Lock the car to arm', since: null, canArm: true, canDisarm: false });
	assert.equal(words(idleState(), parseConfig({ arming: 'parked' })).detail, 'Arms a minute after parking');
	assert.equal(words(idleState(), parseConfig({ arming: 'manual' })).detail, 'Tap Arm to start');
	assert.deepEqual(words({ mode: 'off' }), { tone: 'disarmed', title: 'Kill switch on', detail: 'Turn it off in Diagnostics to use sentry', since: null, canArm: false, canDisarm: false });
	assert.deepEqual(words(INITIAL_SENTRY), { tone: 'disarmed', title: 'Connecting to the car', detail: 'Waiting for the first reading', since: null, canArm: false, canDisarm: false });
});

test('property: random input sequences never build a forbidden state, and every step is idempotent', () => {
	const random = prng(2026);
	const pick = (list) => list[Math.floor(random() * list.length)];
	const configs = [defaults, parseConfig({ arming: 'parked', sensitivity: 'high' }), parseConfig({ arming: 'manual', sensitivity: 'low', v12Floor: 12.8 })];
	for (let run = 0; run < 150; run++) {
		const config = pick(configs);
		let state = INITIAL_SENTRY;
		let now = T0;
		let latest = null;
		let seen = 0;
		for (let i = 0; i < 80; i++) {
			now += Math.floor(random() * 20e3);
			const roll = random();
			let input;
			if (roll < 0.35) {
				latest = snapshot({ at: now, power: pick(['off', 'off', 'off', 'acc', 'on']), locked: random() < 0.6, v12: 12 + random() * 1.3, v12Low: random() < 0.03, soc: 15 + random() * 70,
					charge: random() < 0.15 ? { state: 'charging', kw: 7, dc: false } : { state: 'unplugged' } });
				input = { kind: 'vehicle', snapshot: latest };
			} else if (roll < 0.5) input = { kind: 'detection', at: now, trigger: pick(['motion', 'impact']), cameras: [pick(['front', 'rear', 'left', 'right'])], score: random() };
			else if (roll < 0.6) input = { kind: 'status', status: hostStatus({ killed: random() < 0.1, watch: random() < 0.3 ? { session: 'p' + (now - 1000), since: now - 500 } : null }) };
			else if (roll < 0.7) input = { kind: 'arm' };
			else if (roll < 0.78) input = { kind: 'disarm' };
			else if (roll < 0.85) input = { kind: 'setConfig', patch: {} };
			else input = { kind: 'tick' };
			const t = step(state, input, config, now);
			const again = step(t.state, input, config, now);
			assert.deepEqual(again.state, t.state, 'idempotent state on ' + input.kind + ' run ' + run + ' step ' + i);
			const repeated = input.kind === 'arm' ? again.effects.filter((e) => e.kind !== 'alert') : again.effects;
			assert.deepEqual(repeated, [], 'idempotent effects on ' + input.kind + ' run ' + run + ' step ' + i);
			t.effects.forEach((e) => assert.ok(SENTRY_EFFECTS.indexOf(e.kind) >= 0, 'effect ' + e.kind));
			state = t.state;
			seen += t.effects.length;
			const parkedModes = ['idle', 'armed', 'recording', 'halted'];
			if (latest !== null && state.mode !== 'starting' && state.mode !== 'off' && latest.power !== 'off') {
				assert.ok(state.mode !== 'armed' && state.mode !== 'recording', 'armed or recording while the latest power is ' + latest.power);
			}
			if (state.mode === 'recording') {
				assert.equal(typeof state.armedAt, 'number');
				assert.ok(state.clip && state.clip.id === 'c' + state.clip.startedAt);
			}
			if (parkedModes.indexOf(state.mode) >= 0) assert.equal(state.reading.power, 'off', 'a parked mode holds a parked reading');
		}
		assert.ok(seen >= 0);
	}
});
