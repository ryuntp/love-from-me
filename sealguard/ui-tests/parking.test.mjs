import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, defaults, T0, MINUTE, HOUR } from './support.mjs';
import { parseConfig } from '../app/assets/ui/config.js';
import { EMPTY_HISTORY, record } from '../app/assets/ui/telemetry.js';
import { runtimeBudget, lapsePlan } from '../app/assets/ui/parking.js';

function feed(history, snapshots) { return snapshots.reduce(record, history); }
/** Parked, draining samples from start for hours, soc and v12 moving at the given rates per hour. */
function park(start, hours, socRate, v12Rate, over) {
	const out = [];
	for (let m = 0; m <= hours * 60; m += 10) {
		const h = m / 60;
		out.push(snapshot(Object.assign({ at: start + m * MINUTE, soc: 70 + socRate * h, v12: 13.0 + v12Rate * h }, over || {})));
	}
	return out;
}
const drive = (at) => [snapshot({ at, power: 'on', v12: 14.2 }), snapshot({ at: at + 5 * MINUTE, power: 'on', v12: 14.2 })];

test('without a reading, while driving, and while charging the budget says so', () => {
	assert.deepEqual(runtimeBudget(EMPTY_HISTORY, defaults, T0), { kind: 'learning', reason: 'Waiting for the first reading' });
	assert.deepEqual(runtimeBudget(record(EMPTY_HISTORY, snapshot({ power: 'on' })), defaults, T0), { kind: 'learning', reason: 'Measured once the car parks' });
	const charging = record(EMPTY_HISTORY, snapshot({ charge: { state: 'charging', kw: 7.04, dc: false } }));
	assert.deepEqual(runtimeBudget(charging, defaults, T0), { kind: 'charging', reason: 'Charging at 7.0 kW' });
});

test('a fresh park with no past parks uses the assumed draw: 0.3 percent an hour and no 12V draw', () => {
	const h = feed(EMPTY_HISTORY, park(T0, 0.25, -5, -1));
	const b = runtimeBudget(h, defaults, T0 + 15 * MINUTE);
	assert.equal(b.kind, 'estimate');
	assert.equal(b.basis, 'assumed');
	assert.equal(b.limitedBy, 'soc');
	assert.ok(Math.abs(b.hours - (h.latest.soc - 20) / 0.3) < 1e-9, String(b.hours));
	assert.equal(b.reason, '0.3% an hour assumed until measured, to the charge floor');
});

test('after thirty minutes parked the budget is measured over this park and the nearer floor limits it', () => {
	const h = feed(EMPTY_HISTORY, park(T0, 40 / 60, -1, -0.1));
	const b = runtimeBudget(h, defaults, T0 + 40 * MINUTE);
	assert.equal(b.basis, 'thisPark');
	assert.equal(b.limitedBy, 'v12');
	assert.ok(Math.abs(b.hours - (h.latest.v12 - 12.4) / 0.1) < 1e-6, String(b.hours));
	assert.equal(b.reason, '100 mV an hour measured this park, to the 12V floor');
	const steep = feed(EMPTY_HISTORY, park(T0, 40 / 60, -3, -0.1));
	const socLimited = runtimeBudget(steep, parseConfig({ v12Floor: 11.8, socFloor: 50 }), T0 + 40 * MINUTE);
	assert.equal(socLimited.limitedBy, 'soc');
	assert.ok(Math.abs(socLimited.hours - (steep.latest.soc - 50) / 3) < 1e-6);
	assert.equal(socLimited.reason, '3.0% an hour measured this park, to the charge floor');
	const short = runtimeBudget(feed(EMPTY_HISTORY, park(T0, 20 / 60, -1, -0.1)), defaults, T0 + 20 * MINUTE);
	assert.equal(short.basis, 'assumed', 'under thirty minutes is not yet a measurement');
});

test('before thirty minutes the median draw of the last seven parks stands in', () => {
	let samples = [];
	let t = T0 - 30 * HOUR;
	[-1, -4, -2].forEach((socRate, i) => {
		samples = samples.concat(park(t, 2, socRate, 0.01 * (i - 1)));
		t += 3 * HOUR;
		samples = samples.concat(drive(t));
		t += HOUR;
	});
	samples = samples.concat(park(T0 - 10 * MINUTE, 10 / 60, -1, -0.1));
	const h = feed(EMPTY_HISTORY, samples);
	const b = runtimeBudget(h, defaults, T0);
	assert.equal(b.basis, 'pastParks');
	assert.equal(b.limitedBy, 'soc');
	assert.ok(Math.abs(b.hours - (h.latest.soc - 20) / 2) < 1e-6, String(b.hours));
	assert.equal(b.reason, '2.0% an hour from recent parks, to the charge floor');
	const many = [];
	let start = T0 - 60 * HOUR;
	for (let i = 0; i < 9; i++) {
		park(start, 1, -(i + 1), 0).forEach((s) => many.push(s));
		start += 2 * HOUR;
		drive(start).forEach((s) => many.push(s));
		start += HOUR;
	}
	const later = feed(EMPTY_HISTORY, many.concat(park(T0 - 5 * MINUTE, 5 / 60, 0, 0)));
	const b7 = runtimeBudget(later, defaults, T0);
	assert.ok(Math.abs(b7.hours - (later.latest.soc - 20) / 6) < 1e-6, 'median of the last seven parks, rates 3 to 9, is 6: ' + b7.hours);
});

test('charging stretches are left out of a measurement and a dropping rate is needed for an estimate', () => {
	const chargingPark = park(T0, 1, 2, 0, { charge: { state: 'charging', kw: 7, dc: false } }).concat(park(T0 + 70 * MINUTE, 10 / 60, -1, 0));
	const h = feed(EMPTY_HISTORY, chargingPark);
	assert.equal(runtimeBudget(h, defaults, T0 + 80 * MINUTE).basis, 'assumed', 'ten draining minutes do not measure');
	const flat = feed(EMPTY_HISTORY, park(T0, 1, 0, 0.01));
	assert.deepEqual(runtimeBudget(flat, defaults, T0 + HOUR), { kind: 'learning', reason: 'Neither battery is falling yet' });
	const belowFloor = runtimeBudget(feed(EMPTY_HISTORY, park(T0, 1, -1, 0, { soc: 15 })), defaults, T0 + HOUR);
	assert.equal(belowFloor.kind, 'learning', 'a reading already under the floor has no hours to count');
});

test('the lapse plan is off when disabled, charging, learning or under two hours, else the smallest band under 900 frames', () => {
	const off = parseConfig({ lapse: false });
	const estimate = (hours) => ({ kind: 'estimate', hours, limitedBy: 'soc', basis: 'thisPark', reason: '' });
	assert.deepEqual(lapsePlan(estimate(10), off), { kind: 'off', reason: 'Off in Settings' });
	assert.deepEqual(lapsePlan({ kind: 'charging', reason: '' }, defaults), { kind: 'off', reason: 'Paused while charging' });
	assert.deepEqual(lapsePlan({ kind: 'learning', reason: '' }, defaults), { kind: 'off', reason: 'Waiting for a runtime estimate' });
	assert.deepEqual(lapsePlan(estimate(1.9), defaults), { kind: 'off', reason: 'Under two hours of runtime left' });
	const bands = [[2, 10], [2.5, 10], [3, 20], [5, 20], [6, 30], [7.5, 30], [8, 60], [15, 60], [16, 120], [30, 120], [31, 300], [75, 300], [100, 300], [500, 300]];
	bands.forEach(([hours, intervalS]) => {
		const plan = lapsePlan(estimate(hours), defaults);
		assert.equal(plan.kind, 'run', hours + ' h');
		assert.equal(plan.intervalS, intervalS, hours + ' h');
		if (hours <= 75) assert.ok(hours * 3600 / intervalS <= 900, 'frame count stays under 900 at ' + hours + ' h');
	});
	assert.equal(lapsePlan(estimate(2), defaults).reason, 'One frame every 10 s, about 720 frames');
	assert.equal(lapsePlan(estimate(31), defaults).reason, 'One frame every 5 min, about 372 frames');
});
