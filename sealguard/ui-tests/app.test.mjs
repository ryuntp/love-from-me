import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { memoryStorage, fakeBridge, fixedClock, snapshot, hostStatus, recordedEvent, defaults, prng, T0, MINUTE, HOUR, DAY } from './support.mjs';
import { createApp } from '../app/assets/ui/app.js';
import { createSimulator } from '../app/assets/ui/sim.js';
import { initialWorld, advance, desiredLapse } from '../app/assets/ui/main.js';
import { parseConfig } from '../app/assets/ui/config.js';
import { EMPTY_HISTORY, record } from '../app/assets/ui/telemetry.js';
import { runtimeBudget } from '../app/assets/ui/parking.js';
import { assessBattery } from '../app/assets/ui/battery.js';
import { assessTyres } from '../app/assets/ui/tyres.js';

const SCENARIOS = ['night', 'prowler', 'leak', 'healthy', 'charging'];
const COMMANDS = ['hello', 'startWatch', 'stopWatch', 'startRecording', 'stopRecording', 'saveEvent', 'deleteEvents', 'startLapse', 'stopLapse', 'exportEvent', 'setKill', 'openAutostart'];
const EMPTY_LINK = { heardAt: null, statusAt: null, vehicleAt: null, rejected: 0, lastError: '', deleting: [] };

function boot(scenario, storage, seed) {
	const sim = createSimulator(scenario, seed === undefined ? 7 : seed, 'dark');
	const alerts = [];
	const sent = [];
	const inner = sim.bridge;
	const bridge = { send(text) { sent.push(JSON.parse(text)); inner.send(text); }, listen(fn) { inner.listen(fn); } };
	const app = createApp({ bridge, clock: sim.clock, storage, onAlert: (a) => alerts.push(a) });
	return { sim, app, alerts, sent, storage, world: () => app.world() };
}
/** A world whose sentry has armed under the locked rule from one status and one snapshot at T0. */
function armedWorld(config) {
	const w = initialWorld(config || defaults, EMPTY_HISTORY);
	return advance(advance(w, { kind: 'status', status: hostStatus() }, T0).world, { kind: 'vehicle', snapshot: snapshot() }, T0).world;
}

test('every scenario populates the world inside advanceBy(0), in well under the screenshot wait', () => {
	SCENARIOS.forEach((scenario) => {
		const started = performance.now();
		const s = boot(scenario, memoryStorage());
		assert.equal(s.world().host, null, 'nothing is delivered inside send');
		s.sim.advanceBy(0);
		const ms = performance.now() - started;
		const w = s.world();
		assert.ok(w.host !== null, scenario + ' has a status');
		assert.equal(w.host.version, 'sim 0.1');
		assert.ok(w.events.length >= 4 && w.events.length <= 8, scenario + ' starts with 4 to 8 events: ' + w.events.length);
		w.events.forEach((e) => {
			assert.match(e.thumbUrl, /^data:image\/svg\+xml/);
			assert.match(e.clipUrl, /^data:image\/svg\+xml/);
			assert.ok(e.startedAt < T0 && e.startedAt > T0 - 8 * DAY, scenario + ' event inside the last week');
			assert.ok(decodeURIComponent(e.thumbUrl).indexOf('>Front<') > 0 && decodeURIComponent(e.thumbUrl).indexOf('>Right<') > 0, 'labelled quadrants');
		});
		assert.ok(w.host.mosaic !== null && /^data:image\/svg\+xml/.test(w.host.mosaic.url), scenario + ' has a live mosaic while parked');
		assert.ok(w.history.latest !== null && w.history.latest.power === 'off', scenario + ' is parked');
		assert.ok(w.history.kept.length > 100, scenario + ' backfilled ' + w.history.kept.length + ' kept samples');
		assert.equal(w.sentry.mode, 'armed', scenario + ' arms under the locked rule');
		assert.equal(w.link.rejected, 0, scenario + ' sends only messages the parser accepts: ' + w.link.lastError);
		assert.equal(w.link.statusAt, T0, scenario + ' stamps the first status');
		assert.equal(w.link.vehicleAt, T0, scenario + ' stamps the last vehicle message');
		assert.ok(ms < 200, scenario + ' took ' + ms.toFixed(1) + ' ms, the screenshot runner waits 300');
		s.sent.forEach((c) => assert.ok(COMMANDS.indexOf(c.t) >= 0, 'command ' + c.t));
	});
});

test('the same seed gives the same stream', () => {
	const a = boot('prowler', memoryStorage(), 3);
	const b = boot('prowler', memoryStorage(), 3);
	a.sim.advanceBy(20 * MINUTE);
	b.sim.advanceBy(20 * MINUTE);
	assert.deepEqual(a.world().history.latest, b.world().history.latest);
	assert.deepEqual(a.world().events.map((e) => e.id), b.world().events.map((e) => e.id));
	const c = boot('prowler', memoryStorage(), 4);
	c.sim.advanceBy(20 * MINUTE);
	assert.notDeepEqual(c.world().history.latest.v12, a.world().history.latest.v12);
});

test('night: a weak 12V crosses the floor after about forty minutes and sentry halts with its events saved', () => {
	const s = boot('night', memoryStorage());
	s.sim.advanceBy(0);
	const initial = s.world().events.length;
	const budget = runtimeBudget(s.world().history, s.world().config, s.sim.clock.now());
	assert.equal(budget.kind, 'estimate');
	assert.equal(budget.basis, 'pastParks', 'just parked, the recent parks stand in');
	s.sim.advanceBy(6 * MINUTE);
	assert.equal(s.world().events.length, initial + 1, 'the five-minute detection was recorded and saved');
	assert.ok(s.alerts.some((a) => a.title === 'Recording'));
	s.sim.advanceBy(24 * MINUTE);
	assert.equal(s.world().sentry.mode, 'armed', 'still above the floor at half an hour');
	s.sim.advanceBy(30 * MINUTE);
	const w = s.world();
	assert.equal(w.sentry.mode, 'halted');
	assert.equal(w.sentry.reason, 'v12');
	assert.ok(w.sentry.at - T0 > 35 * MINUTE && w.sentry.at - T0 < 55 * MINUTE, 'halted at ' + (w.sentry.at - T0) / MINUTE + ' min');
	assert.ok(s.alerts.some((a) => a.title === 'Stopped to protect the battery'));
	assert.equal(w.events.length, initial + 1);
	assert.ok(w.host.watch === null && w.host.recording === null && w.host.lapse === null, 'the host was told to stop everything');
	assert.equal(w.lapse, null);
	assert.deepEqual(desiredLapse(w, s.sim.clock.now()), { kind: 'off', reason: 'Stopped to protect the battery' });
	assert.equal(runtimeBudget(w.history, w.config, s.sim.clock.now()).hours, 0, 'under the floor there is no runtime left');
	assert.equal(assessBattery(w.history, s.sim.clock.now()).verdict, 'watch', 'the past week rests under 13 V');
	assert.ok(Object.keys(s.storage.dump()).some((k) => k.indexOf('sealguard.history.') === 0), 'history persisted');
});

test('prowler: three detections become three saved events, the last an impact', () => {
	const s = boot('prowler', memoryStorage());
	s.sim.advanceBy(0);
	const initial = s.world().events.length;
	s.sim.advanceBy(15 * MINUTE);
	const w = s.world();
	assert.equal(w.events.length, initial + 3);
	assert.equal(w.sentry.mode, 'armed');
	const newest = w.events.slice().sort((a, b) => b.startedAt - a.startedAt)[0];
	assert.equal(newest.trigger, 'impact');
	assert.deepEqual(newest.cameras, ['rear']);
	const saved = s.sent.filter((c) => c.t === 'saveEvent');
	assert.equal(saved.length, 3);
	const pack = JSON.parse(saved[0].pack);
	assert.equal(pack.schema, 'sealguard.incident/1');
	assert.ok(pack.telemetry.length > 0, 'the pack carries telemetry around the clip');
	assert.ok(s.sent.some((c) => c.t === 'startLapse'), 'a healthy budget runs the time-lapse');
	assert.equal(w.host.lapse.intervalS, w.lapse.intervalS);
	s.sent.filter((c) => c.t === 'stopRecording').forEach((c) => assert.equal(typeof c.id, 'string', 'stopRecording names the clip by id'));
});

test('prowler: four hours of a quiet park send at most two lapse commands, so the band never flaps', () => {
	const s = boot('prowler', memoryStorage());
	s.sim.advanceBy(0);
	s.sim.advanceBy(4 * HOUR);
	const lapse = s.sent.filter((c) => c.t === 'startLapse' || c.t === 'stopLapse');
	assert.ok(lapse.length <= 2, 'lapse commands: ' + lapse.map((c) => c.t + ':' + c.intervalS).join(' '));
	assert.equal(s.world().sentry.mode, 'armed');
	assert.deepEqual(s.world().lapse, s.world().host.lapse);
});

test('the simulator\'s past nights decline toward today, so the night scenario\'s chart falls', () => {
	const s = boot('night', memoryStorage());
	s.sim.advanceBy(0);
	const battery = assessBattery(s.world().history, s.sim.clock.now());
	assert.equal(battery.verdict, 'watch');
	assert.ok(battery.nights.length >= 5, 'nights: ' + battery.nights.length);
	assert.ok(battery.slopePerDay < -0.01, 'slope per day ' + battery.slopePerDay);
	assert.ok(battery.nights[0].volts > battery.nights[battery.nights.length - 1].volts + 0.08, battery.nights.map((n) => n.volts.toFixed(3)).join(' '));
});

test('a reload mid-recording resumes the same clip and armed time', () => {
	const storage = memoryStorage();
	const first = boot('prowler', storage);
	first.sim.advanceBy(0);
	first.sim.advanceBy(MINUTE + 3e3);
	const before = first.world().sentry;
	assert.equal(before.mode, 'recording');
	const second = createApp({ bridge: first.sim.bridge, clock: first.sim.clock, storage, onAlert: () => {} });
	first.sim.advanceBy(0);
	const after = second.world().sentry;
	assert.equal(after.mode, 'recording');
	assert.equal(after.clip.id, before.clip.id);
	assert.equal(after.armedAt, before.armedAt);
	assert.equal(after.park.id, before.park.id);
	assert.ok(second.world().history.kept.length >= first.world().history.kept.length, 'history came back from storage and the backfill was not duplicated: ' + second.world().history.kept.length + ' vs ' + first.world().history.kept.length);
	assert.ok(Object.keys(storage.dump()).filter((k) => k.indexOf('sealguard.history.') === 0).length >= 8, 'every backfilled day has its key');
	assert.deepEqual(second.world().lapse, second.world().host.lapse, 'the host lapse re-synced');
	first.sim.advanceBy(20e3);
	assert.equal(second.world().sentry.mode, 'armed');
	assert.ok(second.world().events.some((e) => e.id === before.clip.id), 'the resumed clip was saved once');
	assert.equal(second.world().events.filter((e) => e.id === before.clip.id).length, 1);
});

test('a reload while parked with a lapse running never splits the clip, whichever message the host sends first', () => {
	const storage = memoryStorage();
	const first = boot('healthy', storage);
	first.sim.advanceBy(0);
	first.sim.advanceBy(MINUTE);
	const running = first.world().host.lapse;
	assert.ok(running !== null);
	const sent = [];
	const bridge = { send(text) { sent.push(JSON.parse(text)); first.sim.bridge.send(text); }, listen(fn) { first.sim.bridge.listen(fn); } };
	const second = createApp({ bridge, clock: first.sim.clock, storage, onAlert: () => {} });
	first.sim.advanceBy(10 * MINUTE);
	assert.equal(sent.filter((c) => c.t === 'stopLapse').length, 0, 'the running lapse was adopted, not stopped');
	assert.deepEqual(second.world().host.lapse, running, 'the same session clip continues');
});

test('the kill switch moves sentry to off and back through starting once the host confirms', () => {
	const s = boot('healthy', memoryStorage());
	s.sim.advanceBy(0);
	assert.equal(s.world().sentry.mode, 'armed');
	assert.ok(s.world().lapse !== null);
	s.app.dispatch({ kind: 'kill', on: true });
	assert.equal(s.world().sentry.mode, 'armed', 'nothing changes until the host confirms');
	s.sim.advanceBy(0);
	assert.equal(s.world().sentry.mode, 'off');
	assert.equal(s.world().host.killed, true);
	assert.equal(s.world().lapse, null, 'the killed status reports no lapse, so none is owed a stopLapse');
	assert.equal(s.sent.filter((c) => c.t === 'stopLapse').length, 0);
	s.sim.advanceBy(30e3);
	assert.equal(s.world().sentry.mode, 'off', 'readings and ticks do not wake a killed sentry');
	s.app.dispatch({ kind: 'kill', on: false });
	s.sim.advanceBy(0);
	assert.equal(s.world().sentry.mode, 'starting');
	s.sim.advanceBy(10e3);
	assert.equal(s.world().sentry.mode, 'armed');
	assert.ok(s.world().lapse !== null);
});

test('a retention change deletes the expired ids on the host and in the world', () => {
	const s = boot('leak', memoryStorage());
	s.sim.advanceBy(0);
	const now = s.sim.clock.now();
	const old = s.world().events.filter((e) => e.endedAt < now - 3 * DAY).map((e) => e.id);
	assert.ok(old.length >= 2, 'the week of events reaches past three days: ' + old.length);
	s.app.dispatch({ kind: 'setConfig', patch: { retentionDays: 3 } });
	const sent = s.sent.filter((c) => c.t === 'deleteEvents');
	assert.equal(sent.length, 1);
	assert.deepEqual(sent[0].ids.sort(), old.sort());
	s.sim.advanceBy(0);
	assert.ok(s.world().events.every((e) => e.endedAt >= now - 3 * DAY));
	assert.equal(JSON.parse(s.storage.getItem('sealguard.config')).retentionDays, 3, 'config persisted on change');
	s.app.dispatch({ kind: 'delete', id: s.world().events[0].id });
	s.sim.advanceBy(0);
	assert.equal(s.world().events.length, s.world().events.filter((e) => old.indexOf(e.id) === -1).length);
});

test('leak, healthy and charging scenarios read as their names say', () => {
	const leak = boot('leak', memoryStorage());
	leak.sim.advanceBy(0);
	const tyres = assessTyres(leak.world().history, leak.sim.clock.now());
	assert.equal(tyres.verdict, 'leak');
	assert.equal(tyres.wheel, 'rl');
	assert.deepEqual(tyres.wheels, ['rl']);
	assert.equal(assessBattery(leak.world().history, leak.sim.clock.now()).verdict, 'good');
	const healthy = boot('healthy', memoryStorage());
	healthy.sim.advanceBy(0);
	assert.equal(assessTyres(healthy.world().history, healthy.sim.clock.now()).verdict, 'steady');
	assert.equal(assessBattery(healthy.world().history, healthy.sim.clock.now()).verdict, 'good');
	const budget = runtimeBudget(healthy.world().history, healthy.world().config, healthy.sim.clock.now());
	assert.equal(budget.kind, 'estimate');
	assert.notEqual(budget.basis, 'assumed', 'parked nearly three hours, so the draw is measured');
	const charging = boot('charging', memoryStorage());
	charging.sim.advanceBy(0);
	assert.equal(charging.world().history.latest.charge.state, 'charging');
	assert.equal(runtimeBudget(charging.world().history, charging.world().config, charging.sim.clock.now()).kind, 'charging');
	assert.equal(charging.world().lapse, null);
	assert.equal(charging.world().sentry.mode, 'armed');
});

test('export round trips to an alert and openAutostart reaches the host', () => {
	const s = boot('healthy', memoryStorage());
	s.sim.advanceBy(0);
	const id = s.world().events[0].id;
	s.app.dispatch({ kind: 'export', id });
	s.sim.advanceBy(0);
	assert.ok(s.alerts.some((a) => a.title === 'Incident pack exported' && a.body.indexOf(id) > 0));
	s.app.dispatch({ kind: 'openAutostart' });
	assert.ok(s.sent.some((c) => c.t === 'openAutostart'));
});

test('createApp queues inputs that arrive during a dispatch, notifies after every advance, and sends hello on connect', () => {
	const bridge = fakeBridge();
	const clock = fixedClock(T0);
	const storage = memoryStorage();
	const alerts = [];
	const app = createApp({ bridge, clock, storage, onAlert: (a) => alerts.push(a) });
	assert.deepEqual(bridge.json(), [{ v: 1, t: 'hello' }]);
	const seen = [];
	let reentered = false;
	app.subscribe(() => {
		seen.push(app.world().view.route);
		if (!reentered) { reentered = true; app.dispatch({ kind: 'view', patch: { route: 'car' } }); }
	});
	app.dispatch({ kind: 'view', patch: { route: 'events' } });
	assert.deepEqual(seen, ['events', 'car'], 'the nested dispatch waited for the first advance to finish');
	bridge.deliver(JSON.stringify(Object.assign({ v: 1, t: 'status' }, hostStatus())));
	bridge.deliver(JSON.stringify(Object.assign({ v: 1, t: 'vehicle' }, snapshot())));
	assert.equal(app.world().sentry.mode, 'armed');
	assert.equal(bridge.json().filter((c) => c.t === 'startWatch').length, 1);
	clock.advance(1000);
	assert.equal(seen.length, 5, 'status, vehicle and the tick each notified');
	bridge.deliver('nonsense');
	assert.equal(app.world().link.rejected, 1);
	app.dispatch({ kind: 'setConfig', patch: { sensitivity: 'high' } });
	assert.equal(JSON.parse(storage.getItem('sealguard.config')).sensitivity, 'high');
	app.dispatch({ kind: 'arm' });
	assert.equal(alerts.length, 0, 'arm while armed is silent');
	bridge.deliver(JSON.stringify(Object.assign({ v: 1, t: 'vehicle' }, snapshot({ at: T0 + 2000, power: 'on' }))));
	app.dispatch({ kind: 'arm' });
	assert.equal(alerts[alerts.length - 1].title, 'Sentry off while driving');
});

test('advance: view patches merge and a route change closes the sheet, host inputs stamp the link, a status while starting leaves the host lapse alone, clipClosed becomes saveEvent with a pack', () => {
	let w = initialWorld(defaults, EMPTY_HISTORY);
	assert.deepEqual(w.view, { route: 'dashboard', filter: 'all', sheet: null, focus: null, step: 0, killAsked: null });
	w = advance(w, { kind: 'view', patch: { route: 'events', filter: 'impact' } }, T0).world;
	w = advance(w, { kind: 'view', patch: { sheet: { kind: 'event', id: 'c1' }, focus: 'rear', step: 2 } }, T0).world;
	assert.deepEqual(w.view, { route: 'events', filter: 'impact', sheet: { kind: 'event', id: 'c1' }, focus: 'rear', step: 2, killAsked: null });
	const moved = advance(w, { kind: 'view', patch: { route: 'car' } }, T0).world.view;
	assert.deepEqual(moved, { route: 'car', filter: 'impact', sheet: null, focus: null, step: 2, killAsked: null }, 'a route change closes the sheet and the focus');
	assert.deepEqual(advance(w, { kind: 'view', patch: { route: 'events' } }, T0).world.view, w.view, 'the same route keeps them');
	assert.deepEqual(advance(w, { kind: 'view', patch: { sheet: { kind: 'event', id: 'c1', confirm: true } } }, T0).world.view.sheet, { kind: 'event', id: 'c1', confirm: true });
	const deleted = advance(w, { kind: 'delete', id: 'c1' }, T0);
	assert.equal(deleted.world.view.sheet, null, 'deleting the open event closes its sheet');
	assert.deepEqual(deleted.effects, [{ kind: 'deleteEvents', ids: ['c1'] }]);

	const rejected = advance(w, { kind: 'rejected', reason: 'v must be 1' }, T0 + 5);
	assert.deepEqual(rejected.world.link, { heardAt: T0 + 5, statusAt: null, vehicleAt: null, rejected: 1, lastError: 'v must be 1', deleting: [] });
	const exported = advance(w, { kind: 'exported', id: 'c1', ok: false, where: 'disk full' }, T0);
	assert.deepEqual(exported.effects, [{ kind: 'alert', tone: 'alert', title: 'Export failed', body: 'disk full' }]);

	const session = 'p' + (T0 - HOUR);
	const lapse = { session, intervalS: 120 };
	const status = advance(w, { kind: 'status', status: hostStatus({ lapse }) }, T0);
	assert.equal(status.world.host.version, 'test');
	assert.deepEqual(status.effects, [], 'while sentry is starting the host lapse is left alone');
	assert.deepEqual(status.world.lapse, lapse);
	assert.deepEqual(desiredLapse(status.world, T0), { kind: 'off', reason: 'Waiting for the car' });
	const adopted = advance(status.world, { kind: 'vehicle', snapshot: snapshot() }, T0);
	assert.equal(adopted.world.sentry.park.id, session, 'the lapse session names the park');
	assert.deepEqual(adopted.effects.map((e) => e.kind), ['startWatch'], 'the running band is one step from the plan, so it is kept');
	assert.deepEqual(adopted.world.lapse, lapse);

	const armed = advance(advance(w, { kind: 'status', status: hostStatus() }, T0).world, { kind: 'vehicle', snapshot: snapshot() }, T0);
	assert.equal(armed.world.sentry.mode, 'armed');
	assert.deepEqual(armed.effects.map((e) => e.kind), ['startWatch', 'startLapse']);
	assert.equal(armed.effects[1].session, 'p' + T0);
	assert.deepEqual(armed.world.lapse, { session: 'p' + T0, intervalS: armed.effects[1].intervalS });
	const again = advance(armed.world, { kind: 'vehicle', snapshot: snapshot() }, T0);
	assert.deepEqual(again.effects, [], 'the same snapshot again emits nothing');

	const recording = advance(armed.world, { kind: 'detection', at: T0 + 5e3, trigger: 'motion', cameras: ['front'], score: 0.9 }, T0 + 5e3);
	const closed = advance(recording.world, { kind: 'tick' }, T0 + 15e3);
	assert.deepEqual(closed.effects.map((e) => e.kind), ['stopRecording', 'saveEvent']);
	assert.deepEqual(closed.effects[0], { kind: 'stopRecording', id: 'c' + (T0 + 5e3) });
	const pack = JSON.parse(closed.effects[1].pack);
	assert.equal(pack.schema, 'sealguard.incident/1');
	assert.deepEqual(pack.event, closed.effects[1].event);
	assert.equal(pack.telemetry.length, 1, 'the T0 snapshot sits inside the ten second pre-roll');
	assert.equal(JSON.parse(advance(recording.world, { kind: 'tick' }, T0 + 15e3).effects[1].pack).telemetry[0].at, T0);

	const driving = advance(closed.world, { kind: 'vehicle', snapshot: snapshot({ at: T0 + 2 * MINUTE, power: 'on' }) }, T0 + 2 * MINUTE);
	assert.deepEqual(driving.effects.map((e) => e.kind), ['stopWatch', 'stopLapse']);
	assert.equal(driving.world.lapse, null);
	assert.deepEqual(desiredLapse(driving.world, T0 + 2 * MINUTE), { kind: 'off', reason: 'Runs while parked' });
});

test('advance: a kill tap is kept in the view until the host reports the same state', () => {
	const w = initialWorld(defaults, EMPTY_HISTORY);
	const asked = advance(w, { kind: 'view', patch: { killAsked: { on: true, at: T0 } } }, T0).world;
	assert.deepEqual(asked.view.killAsked, { on: true, at: T0 });
	const behind = advance(asked, { kind: 'status', status: hostStatus({ killed: false }) }, T0 + 1000).world;
	assert.deepEqual(behind.view.killAsked, { on: true, at: T0 }, 'a status that has not caught up keeps the ask');
	const confirmed = advance(asked, { kind: 'status', status: hostStatus({ killed: true }) }, T0 + 2000).world;
	assert.equal(confirmed.view.killAsked, null);
	assert.equal(confirmed.host.killed, true);
	const back = advance(confirmed, { kind: 'view', patch: { killAsked: { on: false, at: T0 + 3000 } } }, T0 + 3000).world;
	assert.equal(advance(back, { kind: 'status', status: hostStatus({ killed: true }) }, T0 + 4000).world.view.killAsked, back.view.killAsked);
	assert.equal(advance(back, { kind: 'status', status: hostStatus() }, T0 + 5000).world.view.killAsked, null);
	assert.deepEqual(advance(asked, { kind: 'view', patch: { route: 'car' } }, T0).world.view.killAsked, { on: true, at: T0 }, 'a route change does not forget the tap');
	assert.equal(advance(w, { kind: 'status', status: hostStatus() }, T0).world.view, w.view, 'no ask, nothing to clear');
});

test('advance: a snapshot history refuses never reaches sentry, so a delayed parked sample cannot arm a moving car', () => {
	let w = initialWorld(defaults, EMPTY_HISTORY);
	w = advance(w, { kind: 'status', status: hostStatus() }, T0).world;
	w = advance(w, { kind: 'vehicle', snapshot: snapshot({ at: T0 + 100e3, power: 'on', locked: false }) }, T0 + 100e3).world;
	assert.equal(w.sentry.mode, 'driving');
	const stale = advance(w, { kind: 'vehicle', snapshot: snapshot({ at: T0, power: 'off', locked: true }) }, T0 + 101e3);
	assert.equal(stale.world.sentry.mode, 'driving');
	assert.deepEqual(stale.effects, []);
	assert.equal(stale.world.history.latest.power, 'on');
	assert.equal(stale.world.link.vehicleAt, T0 + 101e3, 'the message still counts as heard from the car');
	const replay = advance(w, { kind: 'vehicle', snapshot: snapshot({ at: T0 + 100e3, power: 'on', locked: false }) }, T0 + 110e3);
	assert.equal(replay.world.sentry, w.sentry);
	assert.deepEqual(replay.effects, []);
	let p = initialWorld(parseConfig({ arming: 'parked' }), EMPTY_HISTORY);
	p = advance(p, { kind: 'status', status: hostStatus() }, T0).world;
	p = advance(p, { kind: 'vehicle', snapshot: snapshot({ at: T0 + 100e3, power: 'on', locked: false }) }, T0 + 100e3).world;
	const underParked = advance(p, { kind: 'vehicle', snapshot: snapshot({ at: T0, power: 'off', locked: false }) }, T0 + 200e3);
	assert.equal(underParked.world.sentry.mode, 'driving');
	assert.deepEqual(underParked.effects, []);
	const fresh = advance(p, { kind: 'vehicle', snapshot: snapshot({ at: T0 + 200e3, power: 'off', locked: false }) }, T0 + 200e3);
	assert.equal(fresh.world.sentry.mode, 'idle', 'a newer sample still parks the car');
});

test('advance: host times over five minutes ahead of the page clock are rejected and counted, and a detection a little ahead is read as now', () => {
	const w = initialWorld(defaults, EMPTY_HISTORY);
	const future = advance(w, { kind: 'vehicle', snapshot: snapshot({ at: T0 + 5 * MINUTE + 1 }) }, T0);
	assert.equal(future.world.history, w.history);
	assert.equal(future.world.sentry, w.sentry);
	assert.equal(future.world.link.rejected, 1);
	assert.equal(future.world.link.lastError, 'at must not be over five minutes ahead');
	assert.equal(future.world.link.heardAt, T0);
	assert.equal(future.world.link.vehicleAt, null);
	assert.deepEqual(future.effects, []);
	assert.equal(advance(w, { kind: 'vehicle', snapshot: snapshot({ at: T0 + 5 * MINUTE }) }, T0).world.history.latest.at, T0 + 5 * MINUTE, 'five minutes exactly is accepted');
	const armed = armedWorld();
	const far = advance(armed, { kind: 'detection', at: 9e13, trigger: 'motion', cameras: ['front'], score: 0.9 }, T0 + 5e3);
	assert.equal(far.world.sentry.mode, 'armed');
	assert.equal(far.world.link.rejected, 1);
	assert.equal(far.world.link.lastError, 'at must not be over five minutes ahead');
	const near = advance(armed, { kind: 'detection', at: T0 + 65e3, trigger: 'motion', cameras: ['front'], score: 0.9 }, T0 + 5e3);
	assert.equal(near.world.sentry.mode, 'recording');
	assert.equal(near.world.sentry.clip.startedAt, T0 + 5e3, 'clamped to the page clock');
	assert.equal(near.world.sentry.clip.id, 'c' + (T0 + 5e3));
	assert.equal(near.world.link.rejected, 0);
	const closes = advance(near.world, { kind: 'tick' }, T0 + 15e3);
	assert.deepEqual(closes.effects.map((e) => e.kind), ['stopRecording', 'saveEvent'], 'a clamped clip still closes on the quiet window');
	const watch = advance(w, { kind: 'status', status: hostStatus({ watch: { session: 'p1', since: T0 + HOUR } }) }, T0);
	assert.equal(watch.world.host, null);
	assert.equal(watch.world.link.lastError, 'watch.since must not be over five minutes ahead');
	assert.equal(watch.world.link.statusAt, null);
	const clip = { id: 'c1', trigger: 'motion', cameras: ['front'], startedAt: T0, lastSeenAt: T0 + HOUR };
	assert.equal(advance(w, { kind: 'status', status: hostStatus({ recording: clip }) }, T0).world.link.lastError, 'recording.lastSeenAt must not be over five minutes ahead');
	assert.equal(advance(w, { kind: 'status', status: hostStatus({ recording: Object.assign({}, clip, { startedAt: T0 + HOUR }) }) }, T0).world.link.lastError, 'recording.startedAt must not be over five minutes ahead');
	const bootClock = advance(w, { kind: 'events', events: [recordedEvent({ id: 'c3600000', startedAt: 3600e3 })] }, T0);
	assert.deepEqual(bootClock.effects, [], 'fresh evidence with a boot clock stamp is not deleted');
	assert.deepEqual(bootClock.world.events, []);
	assert.equal(bootClock.world.link.lastError, 'events[0].startedAt must not be before 2024');
	const ahead = advance(w, { kind: 'events', events: [recordedEvent({ id: 'c1' }), recordedEvent({ id: 'c2', startedAt: T0 + DAY })] }, T0);
	assert.equal(ahead.world.link.lastError, 'events[1].startedAt must not be over five minutes ahead');
	assert.deepEqual(ahead.world.events.map((e) => e.id), ['c1'], 'the event with a good stamp stays');
	assert.equal(advance(w, { kind: 'events', events: [recordedEvent({ id: 'c1', endedAt: T0 + DAY })] }, T0).world.link.lastError, 'events[0].endedAt must not be over five minutes ahead');
	assert.equal(advance(w, { kind: 'events', events: [recordedEvent({ startedAt: Date.UTC(2024, 0, 1) })] }, T0).world.link.rejected, 0, 'the first day of 2024 is a time');
});

test('advance: the link records when the first status and the last vehicle message arrived', () => {
	const w = initialWorld(defaults, EMPTY_HISTORY);
	assert.deepEqual(w.link, EMPTY_LINK);
	const s1 = advance(w, { kind: 'status', status: hostStatus() }, T0);
	assert.equal(s1.world.link.statusAt, T0);
	const s2 = advance(s1.world, { kind: 'status', status: hostStatus() }, T0 + 10e3);
	assert.equal(s2.world.link.statusAt, T0, 'the first status, not the latest');
	assert.equal(s2.world.link.heardAt, T0 + 10e3);
	assert.equal(s2.world.link.vehicleAt, null);
	const v = advance(s2.world, { kind: 'vehicle', snapshot: snapshot({ at: T0 + 12e3 }) }, T0 + 12e3);
	assert.equal(v.world.link.vehicleAt, T0 + 12e3);
	assert.equal(advance(v.world, { kind: 'vehicle', snapshot: snapshot({ at: T0 + 20e3 }) }, T0 + 20e3).world.link.vehicleAt, T0 + 20e3);
	assert.equal(advance(v.world, { kind: 'tick' }, T0 + 30e3).world.link.vehicleAt, T0 + 12e3);
	assert.equal(advance(v.world, { kind: 'rejected', reason: 'x' }, T0 + 30e3).world.link.vehicleAt, T0 + 12e3);
	assert.equal(advance(v.world, { kind: 'events', events: [] }, T0 + 30e3).world.link.heardAt, T0 + 30e3);
});

test('advance: an events index or a retention change deletes expired ids once per session, and setConfig runs through parseConfig', () => {
	const events = [recordedEvent({ id: 'c1', startedAt: T0 - HOUR }), recordedEvent({ id: 'c2', startedAt: T0 - 20 * DAY })];
	const w = initialWorld(defaults, EMPTY_HISTORY);
	const indexed = advance(w, { kind: 'events', events }, T0);
	assert.deepEqual(indexed.effects, [{ kind: 'deleteEvents', ids: ['c2'] }]);
	assert.equal(indexed.world.events, events);
	assert.deepEqual(indexed.world.link.deleting, ['c2']);
	let stuck = indexed.world;
	for (let i = 1; i <= 5; i++) {
		const r = advance(stuck, { kind: 'events', events }, T0 + i);
		assert.deepEqual(r.effects, [], 'a host that cannot delete is asked once per id, reply ' + i);
		stuck = r.world;
	}
	const kept = advance(indexed.world, { kind: 'events', events: [events[0]] }, T0);
	assert.deepEqual(kept.effects, []);
	const shorter = advance(kept.world, { kind: 'setConfig', patch: { retentionDays: 30, socFloor: 99 } }, T0);
	assert.equal(shorter.world.config.retentionDays, 30);
	assert.equal(shorter.world.config.socFloor, 20, 'an out-of-range value falls back');
	assert.deepEqual(shorter.effects, []);
	const wide = advance(advance(w, { kind: 'setConfig', patch: { retentionDays: 30 } }, T0).world, { kind: 'events', events }, T0);
	assert.deepEqual(wide.effects, [], 'twenty days old is inside thirty days');
	const all = advance(wide.world, { kind: 'setConfig', patch: { retentionDays: 3 } }, T0);
	assert.deepEqual(all.effects, [{ kind: 'deleteEvents', ids: ['c2'] }]);
	assert.deepEqual(advance(all.world, { kind: 'setConfig', patch: { retentionDays: 7 } }, T0).effects, [], 'already asked');
	const manual = advance(all.world, { kind: 'delete', id: 'c2' }, T0);
	assert.deepEqual(manual.effects, [{ kind: 'deleteEvents', ids: ['c2'] }], 'the owner\'s own tap always reaches the host');
	assert.deepEqual(manual.world.link.deleting, ['c2']);
	assert.deepEqual(advance(w, { kind: 'delete', id: 'c9' }, T0).world.link.deleting, ['c9']);
	assert.deepEqual(advance(w, { kind: 'kill', on: true }, T0).effects, [{ kind: 'setKill', on: true }]);
	assert.deepEqual(advance(w, { kind: 'export', id: 'c1' }, T0).effects, [{ kind: 'exportEvent', id: 'c1' }]);
	assert.deepEqual(advance(w, { kind: 'openAutostart' }, T0).effects, [{ kind: 'openAutostart' }]);
});

test('desiredLapse is the plan the dashboard shows and the hub sends: off with a reason outside the parked modes, the running band kept inside them', () => {
	const w = initialWorld(defaults, EMPTY_HISTORY);
	assert.deepEqual(desiredLapse(w, T0), { kind: 'off', reason: 'Waiting for the car' });
	const off = advance(w, { kind: 'status', status: hostStatus({ killed: true }) }, T0).world;
	assert.deepEqual(desiredLapse(off, T0), { kind: 'off', reason: 'Kill switch on' });
	const halted = advance(advance(w, { kind: 'status', status: hostStatus() }, T0).world, { kind: 'vehicle', snapshot: snapshot({ v12: 12.3 }) }, T0);
	assert.equal(halted.world.sentry.mode, 'halted');
	assert.deepEqual(halted.effects.map((e) => e.kind), ['alert'], 'no startLapse ever leaves halted');
	assert.deepEqual(desiredLapse(halted.world, T0), { kind: 'off', reason: 'Stopped to protect the battery' });
	const armed = armedWorld();
	assert.equal(desiredLapse(armed, T0).kind, 'run');
	assert.equal(desiredLapse(armed, T0).intervalS, 300);
	assert.deepEqual(armed.lapse, { session: 'p' + T0, intervalS: 300 });
	assert.equal(desiredLapse(Object.assign({}, armed, { lapse: { session: 'p' + T0, intervalS: 120 } }), T0).intervalS, 120, 'one band away stays');
	assert.equal(desiredLapse(Object.assign({}, armed, { lapse: { session: 'p' + T0, intervalS: 20 } }), T0).intervalS, 300, 'four bands away moves');
	assert.equal(desiredLapse(Object.assign({}, armed, { lapse: { session: 'p0', intervalS: 120 } }), T0).intervalS, 300, 'another session\'s band does not count');
	const echoed = advance(armed, { kind: 'status', status: hostStatus({ watch: { session: 'p' + T0, since: T0 }, lapse: { session: 'p' + T0, intervalS: 120 } }) }, T0 + 10e3);
	assert.deepEqual(echoed.effects, [], 'a host running the neighbouring band is left alone');
	assert.deepEqual(echoed.world.lapse, { session: 'p' + T0, intervalS: 120 });
	assert.deepEqual(desiredLapse(armedWorld(parseConfig({ lapse: false })), T0), { kind: 'off', reason: 'Off in Settings' });
});

test('property: through advance, stale and replayed host inputs never arm a moving car, no startLapse comes from halted, and the lapse follows the parked modes', () => {
	const random = prng(99);
	const pick = (list) => list[Math.floor(random() * list.length)];
	const configs = [defaults, parseConfig({ arming: 'parked', v12Floor: 12.8 }), parseConfig({ arming: 'manual', lapse: false })];
	for (let run = 0; run < 60; run++) {
		let w = initialWorld(pick(configs), EMPTY_HISTORY);
		let now = T0;
		const past = [];
		for (let i = 0; i < 120; i++) {
			now += Math.floor(random() * 15e3);
			const roll = random();
			let input;
			if (roll < 0.4) {
				const at = random() < 0.2 ? now - Math.floor(random() * HOUR) : now;
				input = { kind: 'vehicle', snapshot: snapshot({ at, power: pick(['off', 'off', 'off', 'on']), locked: random() < 0.7, v12: 12.2 + random() * 1.2, v12Low: random() < 0.02, soc: 15 + random() * 70, charge: random() < 0.1 ? { state: 'charging', kw: 7, dc: false } : { state: 'unplugged' } }) };
			} else if (roll < 0.55) {
				if (past.length && random() < 0.2) input = pick(past);
				else {
					input = { kind: 'detection', at: random() < 0.1 ? now + Math.floor(random() * 10 * MINUTE) : now, trigger: pick(['motion', 'impact']), cameras: ['front'], score: random() };
					past.push(input);
				}
			} else if (roll < 0.65) input = { kind: 'status', status: hostStatus({ killed: random() < 0.08, lapse: random() < 0.3 ? { session: 'p' + now, intervalS: 30 } : null }) };
			else if (roll < 0.72) input = { kind: 'arm' };
			else if (roll < 0.78) input = { kind: 'disarm' };
			else if (roll < 0.84) input = { kind: 'setConfig', patch: { v12Floor: pick([12.0, 12.4, 12.8]) } };
			else input = { kind: 'tick' };
			const r = advance(w, input, now);
			const mode = r.world.sentry.mode;
			const latest = r.world.history.latest;
			r.effects.forEach((e) => {
				assert.ok(e.kind !== 'clipClosed', 'clipClosed never leaves the hub');
				if (e.kind === 'startLapse') assert.ok(['idle', 'armed', 'recording'].indexOf(mode) >= 0, 'startLapse while ' + mode);
				if (e.kind === 'startWatch' || e.kind === 'startRecording') assert.equal(latest.power, 'off', e.kind + ' while the newest snapshot says ' + latest.power);
			});
			if (mode !== 'starting') {
				if (['idle', 'armed', 'recording'].indexOf(mode) === -1) assert.equal(r.world.lapse, null, 'lapse cleared while ' + mode);
				if (r.world.lapse !== null) assert.equal(r.world.lapse.session, r.world.sentry.park.id);
			}
			if (mode === 'armed' || mode === 'recording') assert.ok(latest !== null && latest.power === 'off', mode + ' while the newest snapshot says ' + (latest && latest.power));
			if (['idle', 'armed', 'recording', 'halted'].indexOf(mode) >= 0) assert.equal(r.world.sentry.reading.at, latest.at, 'sentry reads the newest snapshot history holds');
			if (mode === 'recording') assert.ok(r.world.sentry.clip.startedAt <= now, 'a clip never starts in the future');
			w = r.world;
		}
	}
});

test('advance: a live sample older than the history means the clock stepped back, so the later stamped samples go and sentry still sees the car drive', () => {
	const armed = armedWorld();
	assert.equal(armed.sentry.mode, 'armed');
	const back = T0 - HOUR;
	const driving = advance(armed, { kind: 'vehicle', snapshot: snapshot({ at: back, power: 'on', locked: false }) }, back);
	assert.equal(driving.world.sentry.mode, 'driving');
	assert.equal(driving.world.history.latest.at, back);
	assert.ok(driving.world.history.kept.every((s) => s.at <= back), 'samples the old clock stamped later are gone');
	assert.ok(driving.effects.some((e) => e.kind === 'stopWatch'), 'the watch is stopped');
	const stale = advance(armed, { kind: 'vehicle', snapshot: snapshot({ at: back, power: 'on', locked: false }) }, T0 + 10 * MINUTE);
	assert.equal(stale.world.sentry.mode, 'armed', 'a replayed sample far from the page clock is still refused');
	assert.equal(stale.world.history, armed.history);
	const loaded = initialWorld(defaults, record(EMPTY_HISTORY, snapshot({ at: T0 })));
	const afterStatus = advance(loaded, { kind: 'status', status: hostStatus() }, back).world;
	const decided = advance(afterStatus, { kind: 'vehicle', snapshot: snapshot({ at: back }) }, back).world;
	assert.notEqual(decided.sentry.mode, 'starting', 'a reload after the clock stepped back still decides');
});

test('advance: an events index with one event stamped by an unsynced clock keeps the others and counts the bad one', () => {
	const w = armedWorld();
	const bad = recordedEvent({ startedAt: 3600000 });
	const good = recordedEvent({ startedAt: T0 - 2 * HOUR });
	const next = advance(w, { kind: 'events', events: [bad, good] }, T0);
	assert.deepEqual(next.world.events.map((e) => e.id), [good.id]);
	assert.equal(next.world.link.rejected, 1);
	assert.equal(next.world.link.lastError, 'events[0].startedAt must not be before 2024');
	assert.ok(!next.effects.some((e) => e.kind === 'deleteEvents'), 'the bad stamp triggers no deletion');
	const clean = advance(w, { kind: 'events', events: [good] }, T0);
	assert.equal(clean.world.link.rejected, 0);
});
