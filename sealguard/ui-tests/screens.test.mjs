import { test } from 'node:test';
import assert from 'node:assert/strict';
import './support.mjs';
import { FIELDS, parseConfig } from '../app/assets/ui/config.js';
import { fmt } from '../app/assets/ui/format.js';
import * as ui from '../app/assets/ui/ui.js';
import { boot } from '../app/assets/ui/boot.js';
import * as hub from '../app/assets/ui/main.js';
import { dashboard, tiles, lapseFact, noVehicleStatus } from '../app/assets/ui/screens/dashboard.js';
import { events, TRIGGER_NAMES } from '../app/assets/ui/screens/events.js';
import { cameras } from '../app/assets/ui/screens/cameras.js';
import { car, batteryFinding, tyreFinding, tyreRows, chargeLine } from '../app/assets/ui/screens/car.js';
import { settings, display } from '../app/assets/ui/screens/settings.js';
import { diagnostics } from '../app/assets/ui/screens/diagnostics.js';
import { onboarding } from '../app/assets/ui/screens/onboarding.js';

const HOUR = 3600e3;
const NOW = new Date(2026, 9, 9, 21, 42).getTime();
const PARK = { id: 'p' + (NOW - 2 * HOUR), at: NOW - 2 * HOUR };
const LAYOUT = ['front', 'rear', 'left', 'right'];
const MOSAIC = { url: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E', layout: LAYOUT };
const SCREENS = [dashboard, events, cameras, car, settings, diagnostics, onboarding];
const NO_LINK = { heardAt: null, statusAt: null, vehicleAt: null, rejected: 0, lastError: '' };

function snapshot(over) {
	return Object.assign({
		at: NOW, power: 'off', locked: true, charge: { state: 'unplugged' }, v12: 12.63, v12Low: false, hvV: 381.5, soc: 62,
		tyres: { fl: { kpa: 240, tempC: 24 }, fr: { kpa: 242, tempC: 24 }, rl: { kpa: 231, tempC: 23 }, rr: { kpa: 241, tempC: 23 } },
	}, over);
}

function status(over) {
	return Object.assign({
		version: '0.1.0', killed: false, theme: 'dark', autostart: 'allowed', watch: { session: PARK.id, since: PARK.at }, recording: null, lapse: null,
		cameras: [{ id: 'front', fps: 25 }, { id: 'rear', fps: 25 }, { id: 'left', fps: 24.6 }, { id: 'right', fps: 0 }],
		mosaic: MOSAIC, selfTest: [{ name: 'Cameras', ok: true, detail: 'Four surround cameras answered.' }, { name: 'Storage', ok: false, detail: 'Less than 1 GB free.' }],
	}, over);
}

function event(id, startedAt, trigger, cams) {
	return { id: id, trigger: trigger, cameras: cams, startedAt: startedAt, endedAt: startedAt + 48e3, clipUrl: 'file:///clips/' + id + '.mp4', thumbUrl: 'file:///clips/' + id + '.png', layout: LAYOUT };
}
const EVENTS = [
	event('c1', NOW - 20 * 60e3, 'motion', ['front', 'left']),
	event('c2', NOW - 26 * HOUR, 'impact', ['rear']),
	event('c3', NOW - 5 * 24 * HOUR, 'motion', ['right']),
	event('c4', NOW - 9 * 24 * HOUR, 'motion', ['rear', 'right']),
];

const SENTRY = {
	starting: { mode: 'starting', snapshot: null, status: null },
	driving: { mode: 'driving' },
	off: { mode: 'off' },
	idle: { mode: 'idle', park: PARK, lapseS: null, lowSince: null },
	armed: { mode: 'armed', armedAt: PARK.at, park: PARK, lapseS: 30, lowSince: null },
	recording: { mode: 'recording', armedAt: PARK.at, park: PARK, lapseS: 30, lowSince: null, clip: { id: 'c9', trigger: 'motion', cameras: ['front'], startedAt: NOW - 20e3, lastSeenAt: NOW - 2e3 } },
	halted: { mode: 'halted', park: PARK, reason: 'v12', value: 12.1, at: NOW - 60e3 },
};

function view(over) { return Object.assign({ route: 'dashboard', filter: 'all', sheet: null, focus: null, step: 0 }, over); }

function world(over) {
	const latest = snapshot();
	return Object.assign({
		config: parseConfig({ onboarded: true }),
		history: { latest: latest, recent: [latest], kept: [latest] },
		sentry: SENTRY.armed,
		lapse: null,
		host: status(),
		events: EVENTS,
		link: { heardAt: NOW - 2e3, statusAt: NOW - 2 * HOUR, vehicleAt: NOW - 2e3, rejected: 0, lastError: '' },
		view: view({}),
	}, over);
}

/** A world where the host answered hello but never sent a vehicle message. @param {Millis} statusAt */
function silentWorld(statusAt) {
	return world({ history: { latest: null, recent: [], kept: [] }, sentry: SENTRY.starting, link: { heardAt: statusAt, statusAt: statusAt, vehicleAt: null, rejected: 0, lastError: '' } });
}

test('the modules import under Node and no model reaches for the DOM', () => {
	assert.equal(typeof document, 'undefined');
	assert.equal(typeof window, 'undefined');
	assert.equal(typeof ui.h, 'function');
	assert.equal(typeof boot, 'function');
	SCREENS.forEach((s) => {
		assert.equal(typeof s.model, 'function', s.route);
		assert.equal(typeof s.mount, 'function', s.route);
		assert.ok(s.model(world(), NOW), s.route);
	});
	const empty = world({ host: null, history: { latest: null, recent: [], kept: [] }, events: [], sentry: SENTRY.starting, link: NO_LINK });
	SCREENS.forEach((s) => assert.ok(s.model(empty, NOW), s.route + ' before the first host message'));
});

test('hero tone follows the sentry mode', () => {
	const expected = { starting: 'disarmed', driving: 'disarmed', off: 'disarmed', idle: 'disarmed', armed: 'armed', recording: 'recording', halted: 'alert' };
	Object.keys(expected).forEach((mode) => {
		const m = dashboard.model(world({ sentry: SENTRY[mode] }), NOW);
		assert.equal(m.tone, expected[mode], mode);
		assert.ok(m.title.length > 0, mode + ' has a title');
	});
});

test('hero facts: armed time, 12V, the arm or disarm choice and the kill banner', () => {
	const armed = dashboard.model(world(), NOW);
	assert.equal(armed.armedFor, '2 h');
	assert.equal(armed.v12, '12.6 V');
	assert.equal(armed.canDisarm, true);
	assert.equal(armed.canArm, false);
	assert.deepEqual(armed.mosaic, MOSAIC);
	assert.equal(armed.killed, false);
	assert.equal(armed.diagnosticsLink, false);
	assert.ok(armed.runtime.length > 0 && armed.runtimeWhy.length > 0 && armed.lapse.length > 0);

	const idle = dashboard.model(world({ sentry: SENTRY.idle }), NOW);
	assert.equal(idle.armedFor, 'Not armed');
	assert.equal(idle.canArm, true);

	const killed = dashboard.model(world({ host: status({ killed: true }), sentry: SENTRY.off }), NOW);
	assert.equal(killed.killed, true);

	const silent = dashboard.model(world({ host: null, history: { latest: null, recent: [], kept: [] }, sentry: SENTRY.starting, link: NO_LINK }), NOW);
	assert.equal(silent.v12, 'No reading');
	assert.equal(silent.mosaic, null);
});

test('fact values hold a number or one word and the sentence sits in the why line', () => {
	const words = (value) => value.split(' ').length;
	[SENTRY.armed, SENTRY.idle, SENTRY.halted, SENTRY.off, SENTRY.starting, SENTRY.driving].forEach((sentry) => {
		const m = dashboard.model(world({ sentry }), NOW);
		assert.ok(words(m.lapse) <= 3 && !/\bthe\b|\bfor\b|\bwhile\b/.test(m.lapse), sentry.mode + ' lapse value: ' + m.lapse);
		assert.ok(words(m.runtime) <= 3, sentry.mode + ' runtime value: ' + m.runtime);
	});
	const charging = dashboard.model(world({ history: { latest: snapshot({ charge: { state: 'charging', kw: 7, dc: false } }), recent: [], kept: [] } }), NOW);
	assert.equal(charging.runtime, 'Charging');
	assert.equal(charging.lapse, 'Off');
	assert.match(charging.lapseWhy, /charging/i);
	const off = dashboard.model(world({ config: parseConfig({ onboarded: true, lapse: false }) }), NOW);
	assert.equal(off.lapse, 'Off');
	assert.match(off.lapseWhy, /Settings/);
});

test('the time-lapse line follows the plan the hub sends: the cadence, Off, or Stopped for a halt', () => {
	const armed = { tone: 'armed', title: '', detail: '', since: null, canArm: false, canDisarm: true };
	const alert = { tone: 'alert', title: '', detail: '', since: null, canArm: false, canDisarm: false };
	assert.deepEqual(lapseFact(armed, { kind: 'run', intervalS: 120, reason: 'One frame every 2 min, about 750 frames' }), { value: 'Every 2 min', why: 'One frame every 2 min, about 750 frames' });
	assert.deepEqual(lapseFact(armed, { kind: 'off', reason: 'Paused while charging' }), { value: 'Off', why: 'Paused while charging' });
	assert.deepEqual(lapseFact(alert, { kind: 'off', reason: 'Stopped to protect the battery' }), { value: 'Stopped', why: 'Stopped to protect the battery' });
	assert.equal(lapseFact(alert, { kind: 'run', intervalS: 60, reason: '' }).value, 'Stopped');

	const halted = dashboard.model(world({ sentry: SENTRY.halted }), NOW);
	assert.equal(halted.lapse, 'Stopped');
	assert.ok(halted.lapseWhy.length > 0);
	assert.equal(dashboard.model(world({ sentry: SENTRY.off, host: status({ killed: true }) }), NOW).lapse, 'Off');
	assert.equal(dashboard.model(world({ sentry: SENTRY.starting }), NOW).lapse, 'Off');
	assert.equal(dashboard.model(world({ sentry: SENTRY.driving }), NOW).lapse, 'Off');
	const running = dashboard.model(world(), NOW);
	assert.ok(running.lapse === 'Off' || /^Every \d+ (s|min)$/.test(running.lapse), running.lapse);
	assert.ok(running.lapseWhy.length > 0);
	// The dashboard shows the very plan the hub diffs against world.lapse, so the two cannot disagree.
	const plan = hub.desiredLapse(world(), NOW);
	assert.equal(running.lapse, plan.kind === 'run' ? 'Every ' + fmt.span(plan.intervalS * 1000) : 'Off');
	assert.equal(running.lapseWhy, plan.reason);
});

test('a host that answers but sends no vehicle data for fifteen seconds turns the hero into No vehicle data with the failing self test', () => {
	const early = dashboard.model(silentWorld(NOW - 5e3), NOW);
	assert.equal(early.title, 'Connecting to the car');
	assert.equal(early.tone, 'disarmed');
	assert.equal(early.diagnosticsLink, false);

	const late = dashboard.model(silentWorld(NOW - 15e3), NOW);
	assert.equal(late.title, 'No vehicle data');
	assert.equal(late.tone, 'alert');
	assert.equal(late.detail, 'Less than 1 GB free.');
	assert.equal(late.diagnosticsLink, true);
	assert.equal(late.canArm, false);
	assert.equal(late.canDisarm, false);
	assert.equal(late.v12, 'No reading');

	const noHost = dashboard.model(world({ host: null, history: { latest: null, recent: [], kept: [] }, sentry: SENTRY.starting, link: NO_LINK }), NOW);
	assert.equal(noHost.title, 'Connecting to the car');
	const withData = dashboard.model(world({ link: { heardAt: NOW, statusAt: NOW - HOUR, vehicleAt: NOW, rejected: 0, lastError: '' } }), NOW);
	assert.equal(withData.title, 'Sentry armed');

	assert.equal(noVehicleStatus(status({ selfTest: [{ name: 'Vehicle link', ok: false, detail: '' }] })).detail, 'Vehicle link failed');
	assert.equal(noVehicleStatus(status({ selfTest: [] })).detail, 'The car has not sent a reading');
});

test('dashboard tiles: 12V verdict with resting voltage, tyres with the flagged wheel, and the newest event', () => {
	const leak = { verdict: 'leak', reason: 'Rear left falls 9 kPa a week faster than the others.', wheel: 'rl', wheels: ['rl'],
		tyres: [{ wheel: 'fl', kpa20: 240, kpaPerWeek: -0.4 }, { wheel: 'fr', kpa20: 241, kpaPerWeek: -0.6 }, { wheel: 'rl', kpa20: 228, kpaPerWeek: -9.4 }, { wheel: 'rr', kpa20: 240, kpaPerWeek: 1.2 }] };
	const good = { verdict: 'good', reason: 'Rests well.', nights: [], restingV: 12.71, slopePerDay: 0, sagV: 0.4 };
	const flagged = tiles(good, leak, snapshot(), EVENTS, NOW);
	assert.deepEqual(flagged.battery, { level: 'good', verdict: 'Healthy', detail: '12.7 V resting' });
	assert.deepEqual(flagged.tyres, { level: 'act', verdict: 'Losing air', detail: 'Rear left · 231 kPa' });
	assert.deepEqual(flagged.lastEvent, { level: 'watch', verdict: 'Motion', detail: 'Today 21:22' });

	const impactLast = tiles(good, leak, snapshot(), [EVENTS[1]], NOW);
	assert.deepEqual(impactLast.lastEvent, { level: 'act', verdict: 'Impact', detail: 'Yesterday 19:42' });

	const empty = tiles({ verdict: 'learning', reason: 'Needs three nights.', nights: [] }, { verdict: 'learning', reason: 'Needs a week.' }, null, [], NOW);
	assert.deepEqual(empty.battery, { level: 'unknown', verdict: 'Still learning', detail: 'No reading' });
	assert.deepEqual(empty.tyres, { level: 'unknown', verdict: 'Still learning', detail: 'No reading' });
	assert.deepEqual(empty.lastEvent, { level: 'unknown', verdict: 'No events yet', detail: 'Clips appear here' });
	assert.ok(empty.lastEvent.detail.length <= 18, 'the portrait tile detail is 243 px wide');

	const steady = tiles({ verdict: 'learning', reason: '', nights: [] }, { verdict: 'steady', reason: '', tyres: [] }, snapshot(), [], NOW);
	assert.deepEqual(steady.tyres, { level: 'good', verdict: 'Holding pressure', detail: 'All four read' });
	assert.equal(steady.battery.detail, '12.6 V now');

	const m = dashboard.model(world(), NOW);
	['battery', 'tyres', 'lastEvent'].forEach((key) => {
		assert.ok(['good', 'watch', 'act', 'unknown'].indexOf(m[key].level) >= 0, key);
		assert.ok(m[key].verdict.length > 0 && m[key].detail.length > 0, key);
	});
	assert.deepEqual(m.lastEvent, { level: 'watch', verdict: 'Motion', detail: 'Today 21:22' });
	const bare = dashboard.model(world({ host: null, history: { latest: null, recent: [], kept: [] }, events: [], sentry: SENTRY.starting, link: NO_LINK }), NOW);
	assert.equal(bare.lastEvent.verdict, 'No events yet');
	assert.equal(bare.tyres.detail, 'No reading');
});

test('events: day groups, the filter, the empty state, the sheet and its delete confirmation', () => {
	const all = events.model(world(), NOW);
	assert.equal(all.filter, 'all');
	assert.deepEqual(all.groups.map((g) => g.label), ['Today', 'Yesterday', fmt.day(EVENTS[2].startedAt, NOW), fmt.day(EVENTS[3].startedAt, NOW)]);
	assert.deepEqual(all.groups[0].rows[0], { id: 'c1', time: '21:22', trigger: 'motion', cameras: 'Front, Left', duration: '48 s', thumbUrl: 'file:///clips/c1.png' });
	assert.equal(all.empty, '');
	assert.equal(all.sheet, null);

	const impacts = events.model(world({ view: view({ route: 'events', filter: 'impact' }) }), NOW);
	assert.deepEqual(impacts.groups.map((g) => g.rows.map((r) => r.id)), [['c2']]);

	const none = events.model(world({ events: [], view: view({ route: 'events', filter: 'motion' }) }), NOW);
	assert.equal(none.groups.length, 0);
	assert.match(none.empty, /No motion recordings/);

	const open = events.model(world({ view: view({ route: 'events', sheet: { kind: 'event', id: 'c2' }, focus: 'rear' }) }), NOW);
	assert.equal(open.sheet.id, 'c2');
	assert.equal(open.sheet.title, 'Impact, yesterday 19:42');
	assert.equal(open.sheet.detail, 'Rear · 48 s');
	assert.deepEqual(open.sheet.player, { url: 'file:///clips/c2.mp4', layout: LAYOUT, poster: 'file:///clips/c2.png' });
	assert.equal(open.sheet.focus, 'rear');
	assert.equal(open.sheet.confirm, null);

	const asking = events.model(world({ view: view({ route: 'events', sheet: { kind: 'event', id: 'c2', confirm: true } }) }), NOW);
	assert.equal(asking.sheet.id, 'c2');
	assert.deepEqual(asking.sheet.confirm, { title: 'Delete this recording?', body: 'Impact, yesterday 19:42 will be deleted from the car. It cannot be recovered.', action: 'Delete recording' });

	const gone = events.model(world({ view: view({ route: 'events', sheet: { kind: 'event', id: 'c404' } }) }), NOW);
	assert.equal(gone.sheet, null);
	const retention = events.model(world({ view: view({ route: 'events', sheet: { kind: 'retention', days: 3 } }) }), NOW);
	assert.equal(retention.sheet, null);
	assert.deepEqual(Object.keys(TRIGGER_NAMES).sort(), ['impact', 'motion']);
});

test('cameras: one label per quadrant of the layout, Offline for a camera the host omits, focus only on a camera in the layout, offline reasons', () => {
	const live = cameras.model(world({ host: status({ cameras: [{ id: 'right', fps: 25 }, { id: 'front', fps: 24.5 }] }), view: view({ route: 'cameras', focus: 'right' }) }), NOW);
	assert.deepEqual(live.cameras, [
		{ id: 'front', quadrant: 0, label: 'Front', detail: '25 fps' },
		{ id: 'rear', quadrant: 1, label: 'Rear', detail: 'Offline' },
		{ id: 'left', quadrant: 2, label: 'Left', detail: 'Offline' },
		{ id: 'right', quadrant: 3, label: 'Right', detail: '25 fps' },
	]);
	assert.equal(live.focus, 'right');
	assert.equal(live.offline, '');

	const twoWide = cameras.model(world({ host: status({ mosaic: { url: MOSAIC.url, layout: ['rear', 'front'] } }) }), NOW);
	assert.deepEqual(twoWide.cameras.map((c) => [c.id, c.quadrant, c.detail]), [['rear', 0, '25 fps'], ['front', 1, '25 fps']]);

	const badFocus = cameras.model(world({ view: view({ route: 'cameras', focus: 'roof' }) }), NOW);
	assert.equal(badFocus.focus, null);

	assert.match(cameras.model(world({ host: null }), NOW).offline, /Waiting for the car/);
	assert.deepEqual(cameras.model(world({ host: null }), NOW).cameras, []);
	assert.match(cameras.model(world({ host: status({ mosaic: null }) }), NOW).offline, /surround cameras are off/);
	assert.deepEqual(cameras.model(world({ host: status({ mosaic: null }) }), NOW).cameras, []);
	assert.match(cameras.model(world({ host: status({ mosaic: null, killed: true }) }), NOW).offline, /kill switch/i);
});

test('car: findings map every verdict to a level, tyres carry pressure, trend and the leak flag, charging reads as one line', () => {
	assert.deepEqual(batteryFinding({ verdict: 'learning', reason: 'Needs three nights.', nights: [] }), { level: 'unknown', verdict: 'Still learning', reason: 'Needs three nights.' });
	assert.equal(batteryFinding({ verdict: 'good', reason: '', nights: [], restingV: 12.9, slopePerDay: 0, sagV: null }).level, 'good');
	assert.equal(batteryFinding({ verdict: 'watch', reason: '', nights: [], restingV: 12.5, slopePerDay: -0.01, sagV: 0.6 }).level, 'watch');
	assert.equal(batteryFinding({ verdict: 'replace', reason: '', nights: [], restingV: 12.1, slopePerDay: -0.02, sagV: 1.1 }).level, 'act');

	const leak = { verdict: 'leak', reason: 'Rear left falls 9 kPa a week faster than the others.', wheel: 'rl', wheels: ['rl'],
		tyres: [{ wheel: 'fl', kpa20: 240, kpaPerWeek: -0.4 }, { wheel: 'fr', kpa20: 241, kpaPerWeek: -0.6 }, { wheel: 'rl', kpa20: 228, kpaPerWeek: -9.4 }, { wheel: 'rr', kpa20: 240, kpaPerWeek: 1.2 }] };
	assert.deepEqual(tyreFinding(leak), { level: 'act', verdict: 'Losing air', reason: leak.reason });
	const rows = tyreRows(leak, snapshot());
	assert.deepEqual(rows.map((r) => r.wheel), ['fl', 'fr', 'rl', 'rr']);
	assert.deepEqual(rows[2], { wheel: 'rl', kpa: '231 kPa', trend: '−9 kPa a week', flagged: true });
	assert.deepEqual(rows[0], { wheel: 'fl', kpa: '240 kPa', trend: 'Steady', flagged: false });
	assert.equal(rows[3].trend, '+1 kPa a week');
	assert.equal(tyreRows({ verdict: 'learning', reason: '' }, snapshot({ tyres: null }))[0].kpa, 'No reading');
	assert.equal(tyreFinding({ verdict: 'steady', reason: '', tyres: [] }).level, 'good');

	assert.equal(chargeLine(snapshot()), 'Drive battery at 62%, not plugged in.');
	assert.equal(chargeLine(snapshot({ charge: { state: 'plugged' } })), 'Drive battery at 62%, plugged in and waiting.');
	assert.equal(chargeLine(snapshot({ charge: { state: 'charging', kw: 7.04, dc: false } })), 'Drive battery at 62%, charging at 7.0 kW.');
	assert.equal(chargeLine(snapshot({ charge: { state: 'charging', kw: 88, dc: true } })), 'Drive battery at 62%, charging at 88 kW on a fast charger.');
	assert.equal(chargeLine(null), 'Waiting for the car.');

	const m = car.model(world(), NOW);
	assert.ok(['good', 'watch', 'act', 'unknown'].indexOf(m.battery.level) >= 0);
	assert.ok(['good', 'watch', 'act', 'unknown'].indexOf(m.tyreFinding.level) >= 0);
	assert.equal(m.tyres.length, 4);
	assert.ok(Array.isArray(m.nights));
	assert.equal(m.charge, 'Drive battery at 62%, not plugged in.');
});

test('settings lists every visible FIELDS row with its display text, counts deletions per retention choice, opens the sheet from view, and the About rows lead nowhere', () => {
	const m = settings.model(world(), NOW);
	const visible = FIELDS.filter((f) => f.group !== null);
	assert.deepEqual(m.rows.map((r) => r.key), visible.map((f) => f.key));
	assert.ok(m.rows.every((r) => r.label.length > 0 && r.display.length > 0));
	const byKey = Object.fromEntries(m.rows.map((r) => [r.key, r]));
	assert.equal(byKey.arming.display, 'When locked');
	assert.equal(byKey.v12Floor.display, '12.4 V');
	assert.equal(byKey.socFloor.display, '20%');
	assert.equal(byKey.deterrent.display, 'Off');
	assert.equal(byKey.lapse.display, 'On');
	assert.equal(byKey.retentionDays.display, '14 days');
	assert.equal(m.rows.some((r) => r.key === 'onboarded'), false);
	assert.equal(m.version, '0.1.0');
	assert.ok(m.floorsFooter.length > 0);
	assert.deepEqual(Object.keys(m.wouldDelete).map(Number).sort((a, b) => a - b), [3, 7, 14, 30]);
	assert.equal(m.wouldDelete[3], 2);
	assert.equal(m.wouldDelete[7], 1);
	assert.equal(m.wouldDelete[14], 0);
	assert.equal(m.wouldDelete[30], 0);
	assert.equal(m.sheet, null);

	const asking = settings.model(world({ view: view({ route: 'settings', sheet: { kind: 'retention', days: 3 } }) }), NOW);
	assert.deepEqual(asking.sheet, { days: 3, count: 2 });
	assert.equal(display(visible[0], 'parked'), 'When parked');

	// Nothing in the page may navigate the WebView away: the one external link the About section had is gone.
	const source = settings.mount.toString();
	assert.equal(/href:\s*'[^#']/.test(source), false, 'settings has no href outside the hash');
	assert.match(source, /SIL Open Font License/);
});

test('diagnostics rows carry cameras, power, voltages, the vehicle link age and the self test, and killed follows the host', () => {
	const m = diagnostics.model(world(), NOW);
	const byLabel = Object.fromEntries(m.rows.map((r) => [r.label, r]));
	assert.deepEqual(byLabel['Front camera'], { label: 'Front camera', value: '25 fps', ok: true });
	assert.deepEqual(byLabel['Right camera'], { label: 'Right camera', value: '0 fps', ok: false });
	assert.deepEqual(byLabel.Power, { label: 'Power', value: 'Off', ok: null });
	assert.deepEqual(byLabel['12V battery'], { label: '12V battery', value: '12.6 V', ok: true });
	assert.deepEqual(byLabel['Drive battery'], { label: 'Drive battery', value: '381.5 V, 62%', ok: true });
	assert.deepEqual(byLabel['Last heard from the car'], { label: 'Last heard from the car', value: '2 s ago', ok: true });
	assert.deepEqual(byLabel['Unreadable messages'], { label: 'Unreadable messages', value: '0', ok: true });
	assert.deepEqual(byLabel.Autostart, { label: 'Autostart', value: 'Allowed', ok: true });
	assert.equal(byLabel['Car app'].value, '0.1.0');
	assert.equal('Last error' in byLabel, false);
	assert.equal(m.selfTest.length, 2);
	assert.equal(m.killed, false);
	assert.equal(m.killStatus, '');
	assert.equal(m.killAlert, null);
	assert.equal(m.now, NOW);
	assert.equal(new Set(m.rows.map((r) => r.label)).size, m.rows.length, 'row labels are unique keys');

	const low = diagnostics.model(world({ history: { latest: snapshot({ v12: 12.1, v12Low: true, soc: 15 }), recent: [], kept: [] }, link: { heardAt: NOW - 2e3, statusAt: NOW - HOUR, vehicleAt: NOW - 90e3, rejected: 3, lastError: 'bad json' }, host: status({ killed: true, autostart: 'blocked' }) }), NOW);
	const lowBy = Object.fromEntries(low.rows.map((r) => [r.label, r]));
	assert.deepEqual(lowBy['12V battery'], { label: '12V battery', value: '12.1 V, low', ok: false });
	assert.equal(lowBy['Drive battery'].ok, false);
	assert.deepEqual(lowBy['Last heard from the car'], { label: 'Last heard from the car', value: '2 min ago', ok: false });
	assert.deepEqual(lowBy['Unreadable messages'], { label: 'Unreadable messages', value: '3', ok: false });
	assert.deepEqual(lowBy['Last error'], { label: 'Last error', value: 'bad json', ok: false });
	assert.equal(lowBy.Autostart.ok, false);
	assert.equal(low.killed, true);

	// The host keeps answering while the vehicle link is dead: the row times vehicle messages only and stays grey until one arrives.
	const hostOnly = diagnostics.model(silentWorld(NOW - 20e3), NOW);
	const hostOnlyBy = Object.fromEntries(hostOnly.rows.map((r) => [r.label, r]));
	assert.deepEqual(hostOnlyBy['Last heard from the car'], { label: 'Last heard from the car', value: 'Never', ok: null });

	const silent = diagnostics.model(world({ host: null, history: { latest: null, recent: [], kept: [] }, link: NO_LINK }), NOW);
	assert.deepEqual(silent.rows.slice(0, 3), [
		{ label: 'Cameras', value: 'Waiting for the car', ok: null },
		{ label: 'Power', value: 'Waiting for the car', ok: null },
		{ label: 'Last heard from the car', value: 'Never', ok: null },
	]);
	assert.deepEqual(silent.selfTest, []);
	assert.equal(silent.killed, false);
});

test('the kill switch reads Waiting for the car after a tap until the host confirms, and raises an alert after ten seconds without one', () => {
	const asked = (at, on) => view({ route: 'diagnostics', killAsked: { on, at } });
	const waiting = diagnostics.model(world({ view: asked(NOW - 2e3, true) }), NOW);
	assert.equal(waiting.killStatus, 'Waiting for the car');
	assert.equal(waiting.killAlert, null);
	assert.equal(waiting.killed, false);

	const confirmed = diagnostics.model(world({ view: asked(NOW - 2e3, true), host: status({ killed: true }) }), NOW);
	assert.equal(confirmed.killStatus, '');
	assert.equal(confirmed.killAlert, null);
	assert.equal(confirmed.killed, true);

	const lateConfirm = diagnostics.model(world({ view: asked(NOW - 30e3, true), host: status({ killed: true }) }), NOW);
	assert.equal(lateConfirm.killAlert, null);

	const unanswered = diagnostics.model(world({ view: asked(NOW - 10e3, true) }), NOW);
	assert.equal(unanswered.killStatus, '');
	assert.equal(unanswered.killAlert.tone, 'alert');
	assert.match(unanswered.killAlert.title, /did not answer/);
	assert.equal(unanswered.killed, false);

	const turningOff = diagnostics.model(world({ view: asked(NOW - 1e3, false), host: status({ killed: true }) }), NOW);
	assert.equal(turningOff.killStatus, 'Waiting for the car');
	assert.equal(turningOff.killed, true);

	const noHost = diagnostics.model(world({ view: asked(NOW - 11e3, true), host: null }), NOW);
	assert.ok(noHost.killAlert);
});

test('onboarding reports the page, the autostart reading and the arming label', () => {
	const m = onboarding.model(world({ view: view({ route: 'onboarding', step: 2 }), config: parseConfig({ arming: 'parked' }) }), NOW);
	assert.deepEqual(m, { step: 2, autostart: 'allowed', arming: 'When parked' });
	assert.equal(onboarding.model(world({ host: null }), NOW).autostart, 'unknown');
	assert.equal(onboarding.model(world({ view: view({ route: 'onboarding', step: 9 }) }), NOW).step, 3);
	assert.equal(onboarding.model(world({ config: parseConfig({}) }), NOW).arming, 'When locked');
});

/** The slice of the DOM syncList touches, over a plain array, so the reconciler runs under Node. */
function fakeList() {
	const kids = [];
	function node(key) {
		const attrs = {};
		const el = {
			text: '',
			getAttribute: (name) => (name in attrs ? attrs[name] : null),
			setAttribute: (name, value) => { attrs[name] = String(value); },
			get nextSibling() { const i = kids.indexOf(el); return i >= 0 && i + 1 < kids.length ? kids[i + 1] : null; },
		};
		if (key !== undefined) attrs['data-key'] = key;
		return el;
	}
	const parent = {
		get firstChild() { return kids.length ? kids[0] : null; },
		insertBefore(el, ref) {
			const i = kids.indexOf(el);
			if (i >= 0) kids.splice(i, 1);
			kids.splice(ref === null ? kids.length : kids.indexOf(ref), 0, el);
		},
		removeChild(el) { kids.splice(kids.indexOf(el), 1); },
		keys: () => kids.map((k) => k.getAttribute('data-key')),
		nodes: () => kids.slice(),
	};
	return { parent, node };
}

test('syncList reuses nodes by key, moves them into order, and removes every child it did not reuse, duplicates included', () => {
	const { parent, node } = fakeList();
	const keyOf = (item) => item.key;
	const create = (item) => node();
	const update = (el, item) => { el.text = item.text; };
	ui.syncList(parent, [{ key: 'a', text: 'A' }, { key: 'b', text: 'B' }, { key: 'c', text: 'C' }], keyOf, create, update);
	assert.deepEqual(parent.keys(), ['a', 'b', 'c']);
	const before = parent.nodes();

	ui.syncList(parent, [{ key: 'c', text: 'C2' }, { key: 'a', text: 'A2' }], keyOf, create, update);
	assert.deepEqual(parent.keys(), ['c', 'a']);
	assert.equal(parent.nodes()[0], before[2], 'c keeps its node');
	assert.equal(parent.nodes()[1], before[0], 'a keeps its node');
	assert.equal(parent.nodes()[0].text, 'C2');

	// The host repeats a self test name: two rows, and still two after any number of further renders.
	for (let i = 0; i < 5; i++) ui.syncList(parent, [{ key: 'Camera', text: 'a' }, { key: 'Camera', text: 'b' }], keyOf, create, update);
	assert.deepEqual(parent.keys(), ['Camera', 'Camera']);
	assert.deepEqual(parent.nodes().map((n) => n.text), ['a', 'b']);

	ui.syncList(parent, [{ key: 'Camera', text: 'only' }], keyOf, create, update);
	assert.deepEqual(parent.keys(), ['Camera']);
	ui.syncList(parent, [], keyOf, create, update);
	assert.deepEqual(parent.keys(), []);
});

test('the sparkline spans at least half a volt, so a wobble of millivolts draws flat', () => {
	// ui.sparkline needs the DOM; its scaling rule is pinned here on the same arithmetic.
	const MIN_SPAN_V = 0.5;
	const scale = (values) => {
		const lo = Math.min(...values);
		const hi = Math.max(...values);
		const span = Math.max(hi - lo, MIN_SPAN_V);
		const top = (hi + lo + span) / 2;
		return values.map((v) => (top - v) / span);
	};
	const wobble = scale([13.10, 13.11, 13.09, 13.10]);
	assert.ok(Math.max(...wobble) - Math.min(...wobble) < 0.05, 'a 20 mV wobble uses under a twentieth of the chart');
	assert.ok(wobble.every((y) => y > 0.45 && y < 0.55), 'and sits on the middle line');
	const fall = scale([12.9, 12.4, 11.9]);
	assert.deepEqual(fall.map((y) => Number(y.toFixed(2))), [0, 0.5, 1]);
});

test('car: a watch verdict is a watch level and every named wheel is flagged', () => {
	const health = { verdict: 'watch', reason: 'All four are losing about 5 kPa a week, so check the pressures', wheels: ['fl', 'rr'], tyres: [] };
	assert.equal(tyreFinding(health).level, 'watch');
	assert.equal(tyreFinding(health).verdict, 'Losing pressure');
	const flagged = tyreRows(health, null).filter((r) => r.flagged).map((r) => r.wheel);
	assert.deepEqual(flagged, ['fl', 'rr']);
});
