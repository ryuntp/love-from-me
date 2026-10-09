import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { memoryStorage, fakeBridge, fixedClock, snapshot, hostStatus, recordedEvent, defaults, prng, T0, MINUTE, HOUR, DAY } from './support.mjs';
import { createApp } from '../app/assets/ui/app.js';
import { createSimulator } from '../app/assets/ui/sim.js';
import { initialWorld, advance } from '../app/assets/ui/main.js';
import { parseConfig } from '../app/assets/ui/config.js';
import { EMPTY_HISTORY, record } from '../app/assets/ui/telemetry.js';
import { runtimeBudget } from '../app/assets/ui/parking.js';
import { assessBattery } from '../app/assets/ui/battery.js';
import { assessTyres } from '../app/assets/ui/tyres.js';

const SCENARIOS = ['night', 'prowler', 'leak', 'healthy', 'charging'];
const COMMANDS = ['hello', 'startWatch', 'stopWatch', 'startRecording', 'stopRecording', 'saveEvent', 'deleteEvents', 'startLapse', 'stopLapse', 'exportEvent', 'setKill', 'openAutostart'];

function boot(scenario, storage, seed) {
	const sim = createSimulator(scenario, seed === undefined ? 7 : seed, 'dark');
	const alerts = [];
	const sent = [];
	const inner = sim.bridge;
	const bridge = { send(text) { sent.push(JSON.parse(text)); inner.send(text); }, listen(fn) { inner.listen(fn); } };
	const app = createApp({ bridge, clock: sim.clock, storage, onAlert: (a) => alerts.push(a) });
	return { sim, app, alerts, sent, storage, world: () => app.world() };
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
		assert.ok(ms < 100, scenario + ' took ' + ms.toFixed(1) + ' ms');
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
	assert.equal(assessBattery(leak.world().history, leak.sim.clock.now()).verdict, 'good');
	const healthy = boot('healthy', memoryStorage());
	healthy.sim.advanceBy(0);
	assert.equal(assessTyres(healthy.world().history, healthy.sim.clock.now()).verdict, 'steady');
	assert.equal(assessBattery(healthy.world().history, healthy.sim.clock.now()).verdict, 'good');
	const budget = runtimeBudget(healthy.world().history, healthy.world().config, healthy.sim.clock.now());
	assert.equal(budget.kind, 'estimate');
	assert.equal(budget.basis, 'thisPark', 'parked nearly three hours');
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

test('advance: view patches merge, host inputs stamp the link, status lapse overrides, clipClosed becomes saveEvent with a pack', () => {
	let w = initialWorld(defaults, EMPTY_HISTORY);
	assert.deepEqual(w.view, { route: 'dashboard', filter: 'all', sheet: null, focus: null, step: 0 });
	w = advance(w, { kind: 'view', patch: { route: 'events', filter: 'impact' } }, T0).world;
	w = advance(w, { kind: 'view', patch: { sheet: { kind: 'event', id: 'c1' }, focus: 'rear', step: 2 } }, T0).world;
	assert.deepEqual(w.view, { route: 'events', filter: 'impact', sheet: { kind: 'event', id: 'c1' }, focus: 'rear', step: 2 });
	const deleted = advance(w, { kind: 'delete', id: 'c1' }, T0);
	assert.equal(deleted.world.view.sheet, null, 'deleting the open event closes its sheet');
	assert.deepEqual(deleted.effects, [{ kind: 'deleteEvents', ids: ['c1'] }]);

	const rejected = advance(w, { kind: 'rejected', reason: 'v must be 1' }, T0 + 5);
	assert.deepEqual(rejected.world.link, { heardAt: T0 + 5, rejected: 1, lastError: 'v must be 1' });
	const exported = advance(w, { kind: 'exported', id: 'c1', ok: false, where: 'disk full' }, T0);
	assert.deepEqual(exported.effects, [{ kind: 'alert', tone: 'alert', title: 'Export failed', body: 'disk full' }]);

	const lapse = { session: 'p1', intervalS: 60 };
	const status = advance(w, { kind: 'status', status: hostStatus({ lapse }) }, T0);
	assert.equal(status.world.host.version, 'test');
	assert.deepEqual(status.effects, [{ kind: 'stopLapse', session: 'p1' }], 'the host lapse replaces world.lapse on arrival and starting wants none, so the host one is stopped by its own session');
	assert.equal(status.world.lapse, null);

	let armed = advance(advance(w, { kind: 'status', status: hostStatus() }, T0).world, { kind: 'vehicle', snapshot: snapshot() }, T0);
	assert.equal(armed.world.sentry.mode, 'armed');
	assert.deepEqual(armed.effects.map((e) => e.kind), ['startWatch', 'startLapse']);
	assert.equal(armed.effects[1].session, 'p' + T0);
	assert.deepEqual(armed.world.lapse, { session: 'p' + T0, intervalS: armed.effects[1].intervalS });
	const again = advance(armed.world, { kind: 'vehicle', snapshot: snapshot() }, T0);
	assert.deepEqual(again.effects, [], 'the same snapshot again emits nothing');

	const recording = advance(armed.world, { kind: 'detection', at: T0 + 5e3, trigger: 'motion', cameras: ['front'], score: 0.9 }, T0 + 5e3);
	const closed = advance(recording.world, { kind: 'tick' }, T0 + 15e3);
	assert.deepEqual(closed.effects.map((e) => e.kind), ['stopRecording', 'saveEvent']);
	const pack = JSON.parse(closed.effects[1].pack);
	assert.equal(pack.schema, 'sealguard.incident/1');
	assert.deepEqual(pack.event, closed.effects[1].event);
	assert.equal(pack.telemetry.length, 1, 'the T0 snapshot sits inside the ten second pre-roll');
	assert.equal(JSON.parse(advance(recording.world, { kind: 'tick' }, T0 + 15e3).effects[1].pack).telemetry[0].at, T0);

	const driving = advance(closed.world, { kind: 'vehicle', snapshot: snapshot({ at: T0 + 2 * MINUTE, power: 'on' }) }, T0 + 2 * MINUTE);
	assert.deepEqual(driving.effects.map((e) => e.kind), ['stopWatch', 'stopLapse']);
	assert.equal(driving.world.lapse, null);
});

test('advance: an events index or a retention change deletes expired ids, and setConfig runs through parseConfig', () => {
	const events = [recordedEvent({ id: 'c1', startedAt: T0 - HOUR }), recordedEvent({ id: 'c2', startedAt: T0 - 20 * DAY })];
	const w = initialWorld(defaults, EMPTY_HISTORY);
	const indexed = advance(w, { kind: 'events', events }, T0);
	assert.deepEqual(indexed.effects, [{ kind: 'deleteEvents', ids: ['c2'] }]);
	assert.equal(indexed.world.events, events);
	const kept = advance(indexed.world, { kind: 'events', events: [events[0]] }, T0);
	assert.deepEqual(kept.effects, []);
	const shorter = advance(kept.world, { kind: 'setConfig', patch: { retentionDays: 30, socFloor: 99 } }, T0);
	assert.equal(shorter.world.config.retentionDays, 30);
	assert.equal(shorter.world.config.socFloor, 20, 'an out-of-range value falls back');
	assert.deepEqual(shorter.effects, []);
	const all = advance(advance(w, { kind: 'events', events }, T0 - 30 * DAY).world, { kind: 'setConfig', patch: { retentionDays: 3 } }, T0);
	assert.deepEqual(all.effects, [{ kind: 'deleteEvents', ids: ['c2'] }]);
	assert.deepEqual(advance(w, { kind: 'kill', on: true }, T0).effects, [{ kind: 'setKill', on: true }]);
	assert.deepEqual(advance(w, { kind: 'export', id: 'c1' }, T0).effects, [{ kind: 'exportEvent', id: 'c1' }]);
	assert.deepEqual(advance(w, { kind: 'openAutostart' }, T0).effects, [{ kind: 'openAutostart' }]);
});

test('property: through advance, no startLapse ever comes from halted and the lapse follows the parked modes', () => {
	const random = prng(99);
	const pick = (list) => list[Math.floor(random() * list.length)];
	const configs = [defaults, parseConfig({ arming: 'parked', v12Floor: 12.8 }), parseConfig({ arming: 'manual', lapse: false })];
	for (let run = 0; run < 60; run++) {
		let w = initialWorld(pick(configs), EMPTY_HISTORY);
		let now = T0;
		for (let i = 0; i < 120; i++) {
			now += Math.floor(random() * 15e3);
			const roll = random();
			let input;
			if (roll < 0.4) input = { kind: 'vehicle', snapshot: snapshot({ at: now, power: pick(['off', 'off', 'off', 'on']), locked: random() < 0.7, v12: 12.2 + random() * 1.2, v12Low: random() < 0.02, soc: 15 + random() * 70, charge: random() < 0.1 ? { state: 'charging', kw: 7, dc: false } : { state: 'unplugged' } }) };
			else if (roll < 0.55) input = { kind: 'detection', at: now, trigger: pick(['motion', 'impact']), cameras: ['front'], score: random() };
			else if (roll < 0.65) input = { kind: 'status', status: hostStatus({ killed: random() < 0.08, lapse: random() < 0.3 ? { session: 'p' + now, intervalS: 30 } : null }) };
			else if (roll < 0.72) input = { kind: 'arm' };
			else if (roll < 0.78) input = { kind: 'disarm' };
			else if (roll < 0.84) input = { kind: 'setConfig', patch: { v12Floor: pick([12.0, 12.4, 12.8]) } };
			else input = { kind: 'tick' };
			const r = advance(w, input, now);
			const mode = r.world.sentry.mode;
			r.effects.forEach((e) => {
				assert.ok(e.kind !== 'clipClosed', 'clipClosed never leaves the hub');
				if (e.kind === 'startLapse') assert.ok(['idle', 'armed', 'recording'].indexOf(mode) >= 0, 'startLapse while ' + mode);
			});
			if (['idle', 'armed', 'recording'].indexOf(mode) === -1) assert.equal(r.world.lapse, null, 'lapse cleared while ' + mode);
			if (r.world.lapse !== null) assert.equal(r.world.lapse.session, r.world.sentry.park.id);
			w = r.world;
		}
	}
});
