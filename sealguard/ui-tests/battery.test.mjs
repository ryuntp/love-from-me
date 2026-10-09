import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, T0, HOUR, DAY } from './support.mjs';
import { EMPTY_HISTORY, record } from '../app/assets/ui/telemetry.js';
import { assessBattery, LFP_12V } from '../app/assets/ui/battery.js';

/** Nights oldest first, each a park starting daysAgo days before T0 with resting readings two to four hours in and a wake eight hours in. */
function nights(list, options) {
	const opts = Object.assign({ sag: 0.4, charging: false, restingHours: [2, 3, 4] }, options || {});
	let history = EMPTY_HISTORY;
	list.forEach(({ daysAgo, volts }) => {
		const start = T0 - daysAgo * DAY;
		const charge = opts.charging ? { state: 'charging', kw: 7, dc: false } : { state: 'unplugged' };
		history = record(history, snapshot({ at: start, v12: volts + 0.3, charge }));
		opts.restingHours.forEach((h, i) => { history = record(history, snapshot({ at: start + h * HOUR, v12: volts + [-0.01, 0, 0.01][i % 3], charge })); });
		history = record(history, snapshot({ at: start + 8 * HOUR - 10e3, v12: volts, charge }));
		history = record(history, snapshot({ at: start + 8 * HOUR, power: 'on', v12: volts - opts.sag }));
		history = record(history, snapshot({ at: start + 8 * HOUR + 5e3, power: 'on', v12: 14.0 }));
		history = record(history, snapshot({ at: start + 8 * HOUR + 10e3, power: 'on', v12: 14.1 }));
	});
	return history;
}
const flat = (n, volts) => Array.from({ length: n }, (_, i) => ({ daysAgo: n - i, volts }));

test('the thresholds are one named table for the lithium iron phosphate 12V battery', () => {
	assert.deepEqual(LFP_12V, { restGood: 13.0, restWatch: 12.7, slopeWatchPerDay: -0.015, slopeNights: 5, sagWatch: 0.6, sagReplace: 1.2, minNights: 3 });
});

test('learning until three resting nights exist, counting only samples two hours into a park with no charging', () => {
	assert.deepEqual(assessBattery(EMPTY_HISTORY, T0), { verdict: 'learning', reason: '0 of 3 resting nights measured', nights: [] });
	const two = assessBattery(nights(flat(2, 13.1)), T0);
	assert.equal(two.verdict, 'learning');
	assert.equal(two.reason, '2 of 3 resting nights measured');
	assert.equal(two.nights.length, 2);
	assert.ok(Math.abs(two.nights[0].volts - 13.1) < 1e-9, 'median of the three resting samples');
	assert.equal(two.nights[0].at, T0 - 2 * DAY + 2 * HOUR);
	assert.equal(assessBattery(nights(flat(5, 13.1), { charging: true }), T0).verdict, 'learning', 'charging nights do not rest');
	let early = EMPTY_HISTORY;
	for (let d = 5; d >= 1; d--) {
		const start = T0 - d * DAY;
		[[0, 12.0], [1, 12.0], [2.5, 13.1]].forEach(([h, v12]) => { early = record(early, snapshot({ at: start + h * HOUR, v12 })); });
		early = record(early, snapshot({ at: start + 8 * HOUR, power: 'on', v12: 13.0 }));
	}
	const rested = assessBattery(early, T0);
	assert.equal(rested.verdict, 'good');
	assert.ok(rested.nights.every((n) => Math.abs(n.volts - 13.1) < 1e-9), 'the first two hours still carry surface charge');
	assert.equal(assessBattery(nights(flat(3, 13.1)), T0).verdict, 'good');
});

test('resting voltage decides good, watch and replace', () => {
	const good = assessBattery(nights(flat(5, 13.1)), T0);
	assert.equal(good.verdict, 'good');
	assert.equal(good.reason, 'Rests at 13.1 V over 5 nights');
	assert.ok(Math.abs(good.restingV - 13.1) < 1e-9);
	assert.ok(Math.abs(good.slopePerDay) < 1e-9);
	assert.ok(Math.abs(good.sagV - 0.4) < 1e-9);
	assert.equal(good.nights.length, 5);
	const watch = assessBattery(nights(flat(5, 12.8)), T0);
	assert.equal(watch.verdict, 'watch');
	assert.equal(watch.reason, 'Rests at 12.8 V, under 13.0 V');
	const replace = assessBattery(nights(flat(5, 12.6)), T0);
	assert.equal(replace.verdict, 'replace');
	assert.equal(replace.reason, 'Rests at 12.6 V, under 12.7 V');
	assert.equal(assessBattery(nights(flat(5, 12.6), { sag: 1.3 }), T0).reason, 'Rests at 12.6 V, under 12.7 V', 'the resting voltage is named before the sag');
});

test('a slope steeper than 15 mV a day over at least five nights is watch', () => {
	const falling = (n, perDay) => Array.from({ length: n }, (_, i) => ({ daysAgo: n - i, volts: 13.3 - perDay * i }));
	const six = assessBattery(nights(falling(6, 0.02)), T0);
	assert.equal(six.verdict, 'watch');
	assert.equal(six.reason, 'Falling 20 mV a day over 6 nights');
	assert.ok(Math.abs(six.slopePerDay + 0.02) < 1e-9, String(six.slopePerDay));
	const four = assessBattery(nights(falling(4, 0.03)), T0);
	assert.equal(four.verdict, 'good', 'four nights are too few to call a slope');
	assert.equal(assessBattery(nights(falling(6, 0.01)), T0).verdict, 'good');
});

test('sag on wake decides watch over 0.6 V and replace over 1.2 V', () => {
	const watch = assessBattery(nights(flat(5, 13.1), { sag: 0.8 }), T0);
	assert.equal(watch.verdict, 'watch');
	assert.equal(watch.reason, 'Sags 0.8 V on wake, over 0.6 V');
	const replace = assessBattery(nights(flat(5, 13.1), { sag: 1.3 }), T0);
	assert.equal(replace.verdict, 'replace');
	assert.equal(replace.reason, 'Sags 1.3 V on wake, over 1.2 V');
	assert.ok(Math.abs(replace.sagV - 1.3) < 1e-9);
	let noWake = EMPTY_HISTORY;
	flat(4, 13.1).forEach(({ daysAgo, volts }) => {
		[0, 2, 3, 4].forEach((h) => { noWake = record(noWake, snapshot({ at: T0 - daysAgo * DAY + h * HOUR, v12: volts })); });
	});
	assert.equal(assessBattery(noWake, T0).sagV, null, 'no wake, no sag');
	assert.equal(assessBattery(noWake, T0).nights.length, 4, 'one park spanning days rests once per night');
});
