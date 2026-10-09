import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, hostStatus, idleState, armedState, recordingState, haltedState, parkOf, defaults, prng, T0, MINUTE, HOUR } from './support.mjs';
import { parseConfig } from '../app/assets/ui/config.js';
import { INITIAL_SENTRY, step, sentryStatus } from '../app/assets/ui/sentry.js';

const SENTRY_EFFECTS = ['startWatch', 'stopWatch', 'startRecording', 'stopRecording', 'clipClosed', 'alert'];
/** The commands a status may ask for again, because each one tells the host what the page already holds and a repeat is a no-op there. */
const RECONCILE = ['startWatch', 'stopWatch', 'startRecording', 'stopRecording'];
const vehicle = (over) => ({ kind: 'vehicle', snapshot: snapshot(over) });
const detection = (over) => Object.assign({ kind: 'detection', at: T0 + MINUTE, trigger: 'motion', cameras: ['front'], score: 0.6 }, over);
const status = (over) => ({ kind: 'status', status: hostStatus(over) });
const tick = { kind: 'tick' };
const arm = { kind: 'arm' };
const disarm = { kind: 'disarm' };
const setConfig = { kind: 'setConfig', patch: {} };
const kinds = (t) => t.effects.map((e) => e.kind);

/** Steps once, then feeds the same input to the result and asserts the state holds and no command repeats. An owner's tap may be answered by the same alert again, and a status that still disagrees with the state asks the host for the same correction again. */
function twice(state, input, config, now) {
	const first = step(state, input, config, now);
	const again = step(first.state, input, config, now);
	assert.deepEqual(again.state, first.state, 'same input twice keeps the state: ' + input.kind);
	const tap = input.kind === 'arm' || input.kind === 'disarm';
	const repeated = tap ? again.effects.filter((e) => e.kind !== 'alert') : input.kind === 'status' ? again.effects.filter((e) => RECONCILE.indexOf(e.kind) === -1) : again.effects;
	assert.deepEqual(repeated, [], 'same input twice adds no effects: ' + input.kind);
	if (tap) assert.deepEqual(again.effects, first.effects.filter((e) => e.kind === 'alert'), 'a refused tap is answered the same way each time');
	if (input.kind === 'status') assert.deepEqual(again.effects, first.state.mode === 'off' ? [] : first.effects.filter((e) => RECONCILE.indexOf(e.kind) >= 0), 'the same status asks for the same correction again');
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

test('a reading already past a floor when sentry decides halts at once instead of starting a hold', () => {
	const low = twice(INITIAL_SENTRY, vehicle({ v12: 12.3 }), defaults, T0);
	const halted = twice(low.state, status(), defaults, T0);
	assert.equal(halted.state.mode, 'halted');
	assert.equal(halted.state.reason, 'v12');
	assert.deepEqual(kinds(halted), ['alert'], 'no startWatch for a flat battery');
	assert.deepEqual(halted.state.floors, { v12: 12.4, soc: 20 });
	const soc = twice({ mode: 'starting', snapshot: snapshot({ soc: 19 }), status: null }, status(), defaults, T0);
	assert.equal(soc.state.mode, 'halted');
	assert.equal(soc.state.reason, 'soc');
	assert.equal(twice({ mode: 'starting', snapshot: snapshot({ v12Low: true }), status: null }, status(), defaults, T0).state.mode, 'halted');
	const clip = { id: 'c' + (T0 - 20e3), trigger: 'motion', cameras: ['front'], startedAt: T0 - 20e3, lastSeenAt: T0 - 2e3 };
	const adopted = twice({ mode: 'starting', snapshot: snapshot({ v12: 12.3 }), status: null }, status({ watch: { session: 'p' + (T0 - HOUR), since: T0 - HOUR }, recording: clip }), defaults, T0);
	assert.equal(adopted.state.mode, 'halted');
	assert.deepEqual(kinds(adopted), ['stopRecording', 'clipClosed', 'stopWatch', 'alert'], 'the adopted watch and clip are stopped and the clip saved');
	assert.deepEqual(adopted.state.park, { id: 'p' + (T0 - HOUR), at: T0 - HOUR });
	assert.equal(adopted.state.lastClipAt, T0 - 2e3);
	const parked = twice({ mode: 'driving' }, vehicle({ v12: 12.3 }), defaults, T0);
	assert.equal(parked.state.mode, 'armed', 'a car that has just parked still gets the thirty second hold');
	assert.equal(parked.state.lowSince, T0);
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
	assert.equal(unlocked.state.lastClipAt, T0 + MINUTE, 'a clip closed by an unlock is remembered');
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
	[[{ mode: 'driving' }, /driving/], [haltedState(), /battery/], [{ mode: 'off' }, /Kill switch/], [INITIAL_SENTRY, /Connecting/]].forEach(([state, title]) => {
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
	assert.equal(fromRecording.state.lastClipAt, T0 + MINUTE);

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

test('a detection the host delayed past the quiet window, or replayed from a clip already closed, is ignored', () => {
	const armed = armedState();
	const det = detection({ at: T0 + MINUTE, score: 0.9 });
	const rec = twice(armed, det, defaults, T0 + MINUTE);
	const closed = twice(rec.state, tick, defaults, T0 + MINUTE + 10e3);
	assert.equal(closed.state.mode, 'armed');
	assert.equal(closed.state.lastClipAt, T0 + MINUTE);
	const replayed = twice(closed.state, det, defaults, T0 + MINUTE + 12e3);
	assert.equal(replayed.state, closed.state, 'the replay does not reopen the saved clip');
	assert.deepEqual(replayed.effects, []);
	const later = twice(closed.state, detection({ at: T0 + MINUTE + 12e3, score: 0.9 }), defaults, T0 + MINUTE + 12e3);
	assert.equal(later.state.mode, 'recording', 'a newer detection opens a new clip');
	assert.equal(later.state.clip.id, 'c' + (T0 + MINUTE + 12e3));
	assert.deepEqual(twice(armed, detection({ at: T0 - HOUR, score: 0.9 }), defaults, T0 + MINUTE), { state: armed, effects: [] }, 'an hour old detection starts nothing');
	assert.equal(twice(armed, detection({ at: T0 + MINUTE - 10e3, score: 0.9 }), defaults, T0 + MINUTE).state.mode, 'recording', 'exactly the quiet window old still counts');
	assert.equal(twice(armed, detection({ at: T0 + MINUTE - 10e3 - 1, score: 0.9 }), defaults, T0 + MINUTE).state.mode, 'armed');
	const open = recordingState();
	assert.equal(twice(open, detection({ at: T0 - HOUR, cameras: ['rear'] }), defaults, T0 + MINUTE + 5e3).state, open, 'a stale detection does not touch an open clip');
});

test('a status that disagrees with the state is corrected in both directions; one that matches emits nothing', () => {
	const armed = armedState();
	const lost = twice(armed, status({ watch: null }), defaults, T0 + MINUTE);
	assert.equal(lost.state, armed);
	assert.deepEqual(lost.effects, [{ kind: 'startWatch', session: 'p' + T0, since: T0, deterrent: false }]);
	assert.deepEqual(twice(armed, status({ watch: { session: 'p' + T0, since: T0 } }), defaults, T0 + MINUTE).effects, [], 'a matching status is a no-op');
	const rec = recordingState();
	const lostBoth = twice(rec, status(), defaults, T0 + 2 * MINUTE);
	assert.deepEqual(kinds(lostBoth), ['startWatch', 'startRecording']);
	assert.deepEqual(lostBoth.effects[1], { kind: 'startRecording', clip: rec.clip, preRollS: 10 });
	assert.deepEqual(twice(rec, status({ watch: { session: 'p' + T0, since: T0 }, recording: rec.clip }), defaults, T0 + 2 * MINUTE).effects, []);
	const idle = idleState({ disarmed: true });
	const stillRunning = twice(idle, status({ watch: { session: 'p' + T0, since: T0 }, recording: rec.clip }), defaults, T0 + MINUTE);
	assert.equal(stillRunning.state, idle);
	assert.deepEqual(stillRunning.effects, [{ kind: 'stopRecording', id: rec.clip.id }, { kind: 'stopWatch', session: 'p' + T0 }]);
	assert.deepEqual(twice({ mode: 'driving' }, status({ watch: { session: 'p1', since: T0 } }), defaults, T0).effects, [{ kind: 'stopWatch', session: 'p1' }]);
	assert.deepEqual(kinds(twice(haltedState(), status({ watch: { session: 'p' + T0, since: T0 } }), defaults, T0)), ['stopWatch']);
	assert.deepEqual(kinds(twice(armed, status({ watch: { session: 'p1', since: T0 - HOUR } }), defaults, T0)), ['stopWatch', 'startWatch'], 'a watch on another session is stopped and ours started');
	assert.deepEqual(kinds(twice(armed, status({ recording: rec.clip }), defaults, T0)), ['stopRecording', 'startWatch'], 'a clip the page already closed is stopped without a second clipClosed');
	assert.deepEqual(twice(INITIAL_SENTRY, status(), defaults, T0).effects, [], 'starting still waits for the snapshot');
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
	assert.deepEqual(quiet.effects[0], { kind: 'stopRecording', id: rec.clip.id });
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
	assert.deepEqual(halted.state.floors, { v12: 12.4, soc: 20 });
	assert.deepEqual(halted.effects[1], { kind: 'alert', tone: 'alert', title: 'Stopped to protect the battery', body: '12V at 12.30 V, under the 12.4 V floor' });

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
	assert.equal(whileRecording.state.lastClipAt, T0 + MINUTE);
	assert.equal(twice(armed, vehicle({ at: T0 + 10e3, v12: 12.3, charge: { state: 'charging', kw: 7, dc: false } }), defaults, T0 + 10e3).state.lowSince, null, 'floors are not in play while charging');
});

test('a clock stepped back while a floor is crossed restarts the hold from now', () => {
	const dip = twice(armedState(), vehicle({ at: T0 + 10e3, v12: 12.2 }), defaults, T0 + 10e3);
	assert.equal(dip.state.lowSince, T0 + 10e3);
	const back = twice(dip.state, tick, defaults, T0 + 10e3 - HOUR);
	assert.equal(back.state.mode, 'armed');
	assert.equal(back.state.lowSince, T0 + 10e3 - HOUR, 'the dip restarts at the new clock');
	assert.equal(twice(back.state, tick, defaults, T0 + 10e3 - HOUR + 29e3).state.mode, 'armed');
	assert.equal(twice(back.state, tick, defaults, T0 + 10e3 - HOUR + 30e3).state.mode, 'halted');
});

test('the host 12V low flag halts at once', () => {
	const t = twice(recordingState(), vehicle({ at: T0 + 90e3, v12: 12.9, v12Low: true }), defaults, T0 + 90e3);
	assert.equal(t.state.mode, 'halted');
	assert.equal(t.state.reason, 'v12');
	assert.deepEqual(kinds(t), ['stopRecording', 'clipClosed', 'stopWatch', 'alert']);
	const atStart = twice({ mode: 'driving' }, vehicle({ v12Low: true }), defaults, T0);
	assert.equal(atStart.state.mode, 'halted');
});

test('halted leaves on power, on charging, or on a lowered floor the latest reading clears', () => {
	const halted = haltedState();
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

test('only a changed floor the reading clears by a margin releases a halt; any other setting leaves it alone', () => {
	const halted = haltedState();
	const recovered = twice(halted, vehicle({ at: T0 + 60e3, v12: 12.45 }), defaults, T0 + 60e3);
	assert.equal(recovered.state.mode, 'halted', 'a recovered reading alone does not release');
	const appearance = twice(recovered.state, setConfig, parseConfig({ appearance: 'light' }), T0 + 70e3);
	assert.equal(appearance.state, recovered.state);
	assert.deepEqual(appearance.effects, []);
	assert.equal(twice(recovered.state, setConfig, parseConfig({ arming: 'parked', deterrent: true, sensitivity: 'high' }), T0 + 70e3).state, recovered.state);
	const released = twice(recovered.state, setConfig, parseConfig({ v12Floor: 12.3 }), T0 + 70e3);
	assert.equal(released.state.mode, 'armed', '12.45 V clears a 12.3 V floor by the 0.1 V margin');
	assert.deepEqual(kinds(released), ['startWatch']);
	assert.equal(released.state.lowSince, null);
	const nearer = twice(halted, vehicle({ at: T0 + 60e3, v12: 12.35 }), defaults, T0 + 60e3);
	const notYet = twice(nearer.state, setConfig, parseConfig({ v12Floor: 12.3 }), T0 + 70e3);
	assert.equal(notYet.state.mode, 'halted', 'under the 0.1 V margin');
	assert.deepEqual(notYet.state.floors, { v12: 12.3, soc: 20 }, 'the halt now stands under the new floor');
	assert.equal(twice(notYet.state, setConfig, parseConfig({ v12Floor: 12.3, appearance: 'light' }), T0 + 80e3).state, notYet.state, 'the same floor again changes nothing');
	assert.equal(twice(notYet.state, setConfig, parseConfig({ v12Floor: 12.2 }), T0 + 80e3).state.mode, 'armed');
	assert.equal(twice(nearer.state, setConfig, parseConfig({ v12Floor: 12.6 }), T0 + 70e3).state.mode, 'halted', 'a raised floor never releases');
	const socHalt = haltedState({ reason: 'soc', value: 20, reading: snapshot({ soc: 21.5 }) });
	assert.equal(twice(socHalt, setConfig, parseConfig({ socFloor: 20 }), T0).state, socHalt);
	assert.equal(twice(socHalt, setConfig, parseConfig({ socFloor: 15 }), T0).state.mode, 'armed', 'two points clear of the new floor');
	assert.equal(twice(haltedState({ reason: 'soc', value: 20, reading: snapshot({ soc: 16.5 }) }), setConfig, parseConfig({ socFloor: 15 }), T0).state.mode, 'halted', 'under the two point margin');
	assert.equal(twice(haltedState({ reading: snapshot({ v12: 12.9, v12Low: true }) }), setConfig, parseConfig({ v12Floor: 12.0 }), T0).state.mode, 'halted', 'the car flag holds the halt');
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
	assert.equal(parked.state.lastClipAt, null, 'a new park starts with no clip behind it');
	assert.equal(twice({ mode: 'driving' }, vehicle({ power: 'on' }), defaults, T0).state.mode, 'driving');
});

test('a killed status moves any state to off, closing a clip first, and a later status returns to starting', () => {
	const fromRecording = twice(recordingState(), status({ killed: true }), defaults, T0 + 90e3);
	assert.deepEqual(fromRecording.state, { mode: 'off' });
	assert.deepEqual(kinds(fromRecording), ['stopRecording', 'clipClosed', 'stopWatch']);
	[{ mode: 'driving' }, idleState(), INITIAL_SENTRY, haltedState({ reason: 'soc', value: 20 })].forEach((state) => {
		assert.deepEqual(twice(state, status({ killed: true }), defaults, T0), { state: { mode: 'off' }, effects: [] });
	});
	const back = twice({ mode: 'off' }, status(), defaults, T0);
	assert.equal(back.state.mode, 'starting');
	assert.equal(back.state.snapshot, null);
	assert.deepEqual(twice({ mode: 'off' }, vehicle(), defaults, T0), { state: { mode: 'off' }, effects: [] });
	const redecided = twice(back.state, vehicle(), defaults, T0);
	assert.equal(redecided.state.mode, 'armed');
	assert.equal(twice(armedState(), status({ watch: { session: 'p' + T0, since: T0 } }), defaults, T0).state.mode, 'armed', 'a routine status changes nothing');
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

test('a deterrent change while watching re-sends startWatch with the new value, once', () => {
	const on = parseConfig({ deterrent: true });
	const armed = twice(armedState(), setConfig, on, T0 + 5e3);
	assert.equal(armed.state.mode, 'armed');
	assert.equal(armed.state.deterrent, true);
	assert.deepEqual(armed.effects, [{ kind: 'startWatch', session: 'p' + T0, since: T0, deterrent: true }]);
	const rec = twice(recordingState(), setConfig, on, T0 + 5e3);
	assert.equal(rec.state.mode, 'recording');
	assert.deepEqual(kinds(rec), ['startWatch']);
	assert.equal(rec.effects[0].deterrent, true);
	assert.deepEqual(twice(idleState(), setConfig, parseConfig({ deterrent: true, arming: 'manual' }), T0).effects, [], 'nothing to re-send while idle');
	const fresh = twice(idleState({ reading: snapshot({ locked: false }) }), vehicle({ locked: true }), on, T0 + 5e3);
	assert.equal(fresh.effects[0].deterrent, true, 'arming carries the current setting');
	assert.deepEqual(twice(fresh.state, setConfig, on, T0 + 6e3).effects, [], 'the same value is not re-sent');
	const closed = twice(recordingState({ deterrent: true }), tick, on, T0 + MINUTE + 10e3);
	assert.equal(closed.state.deterrent, true, 'a closing clip keeps the value the host holds');
});

test('sentryStatus words, tones, since and the arm and disarm choices', () => {
	const words = (state, config) => sentryStatus(state, config || defaults, T0 + 2 * MINUTE);
	assert.deepEqual(words(armedState()), { tone: 'armed', title: 'Sentry armed', detail: 'Since 21:00', since: T0, canArm: false, canDisarm: true });
	const rec = words(recordingState({ clip: { trigger: 'impact', cameras: ['rear', 'right'] } }));
	assert.deepEqual(rec, { tone: 'recording', title: 'Recording', detail: 'Impact on the rear and right cameras', since: T0, canArm: false, canDisarm: true });
	const halted = words(haltedState({ value: 12.1 }));
	assert.deepEqual(halted, { tone: 'alert', title: 'Stopped to protect the battery', detail: '12V at 12.10 V, under the 12.4 V floor', since: null, canArm: false, canDisarm: false });
	assert.equal(words(haltedState({ value: 12.38 })).detail, '12V at 12.38 V, under the 12.4 V floor', 'two decimals so a reading just under the floor never prints as the floor');
	assert.equal(words(haltedState({ reason: 'soc', value: 18 }), parseConfig({ socFloor: 20 })).detail, 'Charge at 18%, at the 20% floor');
	assert.deepEqual(words({ mode: 'driving' }), { tone: 'disarmed', title: 'Sentry off while driving', detail: 'Arms when you park and lock', since: null, canArm: false, canDisarm: false });
	assert.deepEqual(words(idleState()), { tone: 'disarmed', title: 'Sentry idle', detail: 'Lock the car to arm', since: null, canArm: true, canDisarm: false });
	assert.equal(words(idleState(), parseConfig({ arming: 'parked' })).detail, 'Arms a minute after parking');
	assert.equal(words(idleState(), parseConfig({ arming: 'manual' })).detail, 'Tap Arm to start');
	assert.deepEqual(words({ mode: 'off' }), { tone: 'disarmed', title: 'Kill switch on', detail: 'Turn it off in Diagnostics to use sentry', since: null, canArm: false, canDisarm: false });
	assert.deepEqual(words(INITIAL_SENTRY), { tone: 'disarmed', title: 'Connecting to the car', detail: 'Waiting for the first reading', since: null, canArm: false, canDisarm: false });
});

test('property: random, stale and replayed input sequences never build a forbidden state or reopen a closed clip, and every step is idempotent', () => {
	const random = prng(2026);
	const pick = (list) => list[Math.floor(random() * list.length)];
	const configs = [defaults, parseConfig({ arming: 'parked', sensitivity: 'high' }), parseConfig({ arming: 'manual', sensitivity: 'low', v12Floor: 12.8 })];
	const parkedModes = ['idle', 'armed', 'recording', 'halted'];
	for (let run = 0; run < 150; run++) {
		const config = pick(configs);
		let state = INITIAL_SENTRY;
		let now = T0;
		let latest = null;
		let seen = 0;
		let parkId = null;
		let closed = [];
		const past = [];
		for (let i = 0; i < 80; i++) {
			now += Math.floor(random() * 20e3);
			const roll = random();
			let input;
			if (roll < 0.35) {
				latest = snapshot({ at: now, power: pick(['off', 'off', 'off', 'acc', 'on']), locked: random() < 0.6, v12: 12 + random() * 1.3, v12Low: random() < 0.03, soc: 15 + random() * 70,
					charge: random() < 0.15 ? { state: 'charging', kw: 7, dc: false } : { state: 'unplugged' } });
				input = { kind: 'vehicle', snapshot: latest };
			} else if (roll < 0.5) {
				if (past.length && random() < 0.2) input = pick(past);
				else {
					input = { kind: 'detection', at: random() < 0.2 ? now - Math.floor(random() * HOUR) : now, trigger: pick(['motion', 'impact']), cameras: [pick(['front', 'rear', 'left', 'right'])], score: random() };
					past.push(input);
				}
			} else if (roll < 0.6) {
				input = { kind: 'status', status: hostStatus({ killed: random() < 0.1, watch: random() < 0.3 ? { session: 'p' + (now - 1000), since: now - 500 } : null,
					recording: random() < 0.1 ? { id: 'c' + (now - 700), trigger: 'motion', cameras: ['front'], startedAt: now - 700, lastSeenAt: now - 600 } : null }) };
			} else if (roll < 0.7) input = { kind: 'arm' };
			else if (roll < 0.78) input = { kind: 'disarm' };
			else if (roll < 0.85) input = { kind: 'setConfig', patch: {} };
			else input = { kind: 'tick' };
			const t = step(state, input, config, now);
			const again = step(t.state, input, config, now);
			assert.deepEqual(again.state, t.state, 'idempotent state on ' + input.kind + ' run ' + run + ' step ' + i);
			const repeated = input.kind === 'arm' ? again.effects.filter((e) => e.kind !== 'alert') : input.kind === 'status' ? again.effects.filter((e) => RECONCILE.indexOf(e.kind) === -1) : again.effects;
			assert.deepEqual(repeated, [], 'idempotent effects on ' + input.kind + ' run ' + run + ' step ' + i);
			t.effects.forEach((e) => assert.ok(SENTRY_EFFECTS.indexOf(e.kind) >= 0, 'effect ' + e.kind));
			const park = t.state.park ? t.state.park.id : null;
			if (park !== parkId) { parkId = park; closed = []; }
			t.effects.forEach((e) => {
				if (e.kind === 'startRecording') assert.ok(closed.indexOf(e.clip.id) === -1, 'a closed clip was reopened: ' + e.clip.id + ' run ' + run + ' step ' + i);
				if (e.kind === 'clipClosed') closed.push(e.event.id);
			});
			state = t.state;
			seen += t.effects.length;
			if (latest !== null && state.mode !== 'starting' && state.mode !== 'off' && latest.power !== 'off') {
				assert.ok(state.mode !== 'armed' && state.mode !== 'recording', 'armed or recording while the latest power is ' + latest.power);
			}
			if (state.mode === 'recording') {
				assert.equal(typeof state.armedAt, 'number');
				assert.equal(typeof state.deterrent, 'boolean');
				assert.ok(state.clip && state.clip.id === 'c' + state.clip.startedAt);
				assert.ok(state.lastClipAt === null || state.clip.startedAt > state.lastClipAt, 'a clip starts after the last one closed');
			}
			if (state.mode === 'halted') assert.deepEqual(state.floors, { v12: config.v12Floor, soc: config.socFloor });
			if (parkedModes.indexOf(state.mode) >= 0) assert.equal(state.reading.power, 'off', 'a parked mode holds a parked reading');
		}
		assert.ok(seen >= 0);
	}
});
