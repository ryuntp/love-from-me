import { test } from 'node:test';
import assert from 'node:assert/strict';
import './support.mjs';
import { FIELDS, parseConfig } from '../app/assets/ui/config.js';
import { fmt } from '../app/assets/ui/format.js';
import * as ui from '../app/assets/ui/ui.js';
import { boot } from '../app/assets/ui/boot.js';
import { dashboard, tiles } from '../app/assets/ui/screens/dashboard.js';
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

function world(over) {
	const latest = snapshot();
	return Object.assign({
		config: parseConfig({ onboarded: true }),
		history: { latest: latest, recent: [latest], kept: [latest] },
		sentry: SENTRY.armed,
		lapse: null,
		host: status(),
		events: EVENTS,
		link: { heardAt: NOW - 2e3, rejected: 0, lastError: '' },
		view: { route: 'dashboard', filter: 'all', sheet: null, focus: null, step: 0 },
	}, over);
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
	const empty = world({ host: null, history: { latest: null, recent: [], kept: [] }, events: [], sentry: SENTRY.starting, link: { heardAt: null, rejected: 0, lastError: '' } });
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
	assert.ok(armed.runtime.length > 0 && armed.runtimeWhy.length > 0 && armed.lapse.length > 0);

	const idle = dashboard.model(world({ sentry: SENTRY.idle }), NOW);
	assert.equal(idle.armedFor, 'Not armed');
	assert.equal(idle.canArm, true);

	const killed = dashboard.model(world({ host: status({ killed: true }), sentry: SENTRY.off }), NOW);
	assert.equal(killed.killed, true);

	const silent = dashboard.model(world({ host: null, history: { latest: null, recent: [], kept: [] }, sentry: SENTRY.starting }), NOW);
	assert.equal(silent.v12, 'No reading');
	assert.equal(silent.mosaic, null);
});

test('dashboard tiles: 12V verdict with resting voltage, tyres with the flagged wheel, and the newest event', () => {
	const leak = { verdict: 'leak', reason: 'Rear left falls 9 kPa a week faster than the others.', wheel: 'rl',
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
	assert.equal(empty.lastEvent.level, 'unknown');
	assert.equal(empty.lastEvent.verdict, 'No events yet');

	const steady = tiles({ verdict: 'learning', reason: '', nights: [] }, { verdict: 'steady', reason: '', tyres: [] }, snapshot(), [], NOW);
	assert.deepEqual(steady.tyres, { level: 'good', verdict: 'Holding pressure', detail: 'All four read' });
	assert.equal(steady.battery.detail, '12.6 V now');

	const m = dashboard.model(world(), NOW);
	['battery', 'tyres', 'lastEvent'].forEach((key) => {
		assert.ok(['good', 'watch', 'act', 'unknown'].indexOf(m[key].level) >= 0, key);
		assert.ok(m[key].verdict.length > 0 && m[key].detail.length > 0, key);
	});
	assert.deepEqual(m.lastEvent, { level: 'watch', verdict: 'Motion', detail: 'Today 21:22' });
	const bare = dashboard.model(world({ host: null, history: { latest: null, recent: [], kept: [] }, events: [], sentry: SENTRY.starting }), NOW);
	assert.equal(bare.lastEvent.verdict, 'No events yet');
	assert.equal(bare.tyres.detail, 'No reading');
});

test('events: day groups, the filter, the empty state and the sheet', () => {
	const all = events.model(world(), NOW);
	assert.equal(all.filter, 'all');
	assert.deepEqual(all.groups.map((g) => g.label), ['Today', 'Yesterday', fmt.day(EVENTS[2].startedAt, NOW), fmt.day(EVENTS[3].startedAt, NOW)]);
	assert.deepEqual(all.groups[0].rows[0], { id: 'c1', time: '21:22', trigger: 'motion', cameras: 'Front, Left', duration: '48 s', thumbUrl: 'file:///clips/c1.png' });
	assert.equal(all.empty, '');
	assert.equal(all.sheet, null);

	const impacts = events.model(world({ view: { route: 'events', filter: 'impact', sheet: null, focus: null, step: 0 } }), NOW);
	assert.deepEqual(impacts.groups.map((g) => g.rows.map((r) => r.id)), [['c2']]);

	const none = events.model(world({ events: [], view: { route: 'events', filter: 'motion', sheet: null, focus: null, step: 0 } }), NOW);
	assert.equal(none.groups.length, 0);
	assert.match(none.empty, /No motion recordings/);

	const open = events.model(world({ view: { route: 'events', filter: 'all', sheet: { kind: 'event', id: 'c2' }, focus: 'rear', step: 0 } }), NOW);
	assert.equal(open.sheet.id, 'c2');
	assert.equal(open.sheet.title, 'Impact, yesterday 19:42');
	assert.equal(open.sheet.detail, 'Rear · 48 s');
	assert.deepEqual(open.sheet.player, { url: 'file:///clips/c2.mp4', layout: LAYOUT, poster: 'file:///clips/c2.png' });
	assert.equal(open.sheet.focus, 'rear');

	const gone = events.model(world({ view: { route: 'events', filter: 'all', sheet: { kind: 'event', id: 'c404' }, focus: null, step: 0 } }), NOW);
	assert.equal(gone.sheet, null);
	assert.deepEqual(Object.keys(TRIGGER_NAMES).sort(), ['impact', 'motion']);
});

test('cameras: labels in quadrant order, fps text, focus only on a camera in the layout, offline reasons', () => {
	const live = cameras.model(world({ host: status({ cameras: [{ id: 'right', fps: 25 }, { id: 'front', fps: 24.5 }] }), view: { route: 'cameras', filter: 'all', sheet: null, focus: 'right', step: 0 } }), NOW);
	assert.deepEqual(live.cameras, [{ id: 'front', label: 'Front', fps: '25 fps' }, { id: 'right', label: 'Right', fps: '25 fps' }]);
	assert.equal(live.focus, 'right');
	assert.equal(live.offline, '');

	const badFocus = cameras.model(world({ view: { route: 'cameras', filter: 'all', sheet: null, focus: 'roof', step: 0 } }), NOW);
	assert.equal(badFocus.focus, null);

	assert.match(cameras.model(world({ host: null }), NOW).offline, /Waiting for the car/);
	assert.match(cameras.model(world({ host: status({ mosaic: null }) }), NOW).offline, /surround cameras are off/);
	assert.match(cameras.model(world({ host: status({ mosaic: null, killed: true }) }), NOW).offline, /kill switch/i);
});

test('car: findings map every verdict to a level, tyres carry pressure, trend and the leak flag, charging reads as one line', () => {
	assert.deepEqual(batteryFinding({ verdict: 'learning', reason: 'Needs three nights.', nights: [] }), { level: 'unknown', verdict: 'Still learning', reason: 'Needs three nights.' });
	assert.equal(batteryFinding({ verdict: 'good', reason: '', nights: [], restingV: 12.9, slopePerDay: 0, sagV: null }).level, 'good');
	assert.equal(batteryFinding({ verdict: 'watch', reason: '', nights: [], restingV: 12.5, slopePerDay: -0.01, sagV: 0.6 }).level, 'watch');
	assert.equal(batteryFinding({ verdict: 'replace', reason: '', nights: [], restingV: 12.1, slopePerDay: -0.02, sagV: 1.1 }).level, 'act');

	const leak = { verdict: 'leak', reason: 'Rear left falls 9 kPa a week faster than the others.', wheel: 'rl',
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

test('settings lists every visible FIELDS row with its display text, counts deletions per retention choice, and opens the sheet from view', () => {
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

	const asking = settings.model(world({ view: { route: 'settings', filter: 'all', sheet: { kind: 'retention', days: 3 }, focus: null, step: 0 } }), NOW);
	assert.deepEqual(asking.sheet, { days: 3, count: 2 });
	assert.equal(display(visible[0], 'parked'), 'When parked');
});

test('diagnostics rows carry cameras, power, voltages, link health and the self test, and killed follows the host', () => {
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
	assert.equal(new Set(m.rows.map((r) => r.label)).size, m.rows.length, 'row labels are unique keys');

	const low = diagnostics.model(world({ history: { latest: snapshot({ v12: 12.1, v12Low: true, soc: 15 }), recent: [], kept: [] }, link: { heardAt: NOW - 90e3, rejected: 3, lastError: 'bad json' }, host: status({ killed: true, autostart: 'blocked' }) }), NOW);
	const lowBy = Object.fromEntries(low.rows.map((r) => [r.label, r]));
	assert.deepEqual(lowBy['12V battery'], { label: '12V battery', value: '12.1 V, low', ok: false });
	assert.equal(lowBy['Drive battery'].ok, false);
	assert.deepEqual(lowBy['Last heard from the car'], { label: 'Last heard from the car', value: '2 min ago', ok: false });
	assert.deepEqual(lowBy['Unreadable messages'], { label: 'Unreadable messages', value: '3', ok: false });
	assert.deepEqual(lowBy['Last error'], { label: 'Last error', value: 'bad json', ok: false });
	assert.equal(lowBy.Autostart.ok, false);
	assert.equal(low.killed, true);

	const silent = diagnostics.model(world({ host: null, history: { latest: null, recent: [], kept: [] }, link: { heardAt: null, rejected: 0, lastError: '' } }), NOW);
	assert.deepEqual(silent.rows.slice(0, 3), [
		{ label: 'Cameras', value: 'Waiting for the car', ok: null },
		{ label: 'Power', value: 'Waiting for the car', ok: null },
		{ label: 'Last heard from the car', value: 'Never', ok: false },
	]);
	assert.deepEqual(silent.selfTest, []);
	assert.equal(silent.killed, false);
});

test('onboarding reports the page, the autostart reading and the arming label', () => {
	const m = onboarding.model(world({ view: { route: 'onboarding', filter: 'all', sheet: null, focus: null, step: 2 }, config: parseConfig({ arming: 'parked' }) }), NOW);
	assert.deepEqual(m, { step: 2, autostart: 'allowed', arming: 'When parked' });
	assert.equal(onboarding.model(world({ host: null }), NOW).autostart, 'unknown');
	assert.equal(onboarding.model(world({ view: { route: 'onboarding', filter: 'all', sheet: null, focus: null, step: 9 } }), NOW).step, 3);
	assert.equal(onboarding.model(world({ config: parseConfig({}) }), NOW).arming, 'When locked');
});
