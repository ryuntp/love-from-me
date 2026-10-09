import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, T0, HOUR, DAY } from './support.mjs';
import { EMPTY_HISTORY, record } from '../app/assets/ui/telemetry.js';
import { assessTyres, compensate } from '../app/assets/ui/tyres.js';

/** Gauge pressure a tyre at kpa20 cold shows at tempC. */
function warm(kpa20, tempC) { return (kpa20 + 101.325) * ((273.15 + tempC) / 293.15) - 101.325; }

/** days of history, oldest first; coldAt(dayIndex) gives each wheel's true cold pressure, with the evening temperature varying by day. */
function tyreHistory(days, coldAt, options) {
	const opts = Object.assign({ hoursIn: [2, 3], tyres: true }, options || {});
	let history = EMPTY_HISTORY;
	for (let i = 0; i < days; i++) {
		const daysAgo = days - 1 - i;
		const start = T0 - daysAgo * DAY - 3 * HOUR;
		const tempC = 24 + 4 * Math.sin(i);
		const cold = coldAt(i);
		const tyres = (t) => (opts.tyres ? { fl: { kpa: warm(cold.fl, t), tempC: t }, fr: { kpa: warm(cold.fr, t), tempC: t }, rl: { kpa: warm(cold.rl, t), tempC: t }, rr: { kpa: warm(cold.rr, t), tempC: t } } : null);
		history = record(history, snapshot({ at: start - 20 * 60e3, power: 'on', tyres: tyres(tempC + 8) }));
		history = record(history, snapshot({ at: start, tyres: tyres(tempC + 6) }));
		opts.hoursIn.forEach((h) => { history = record(history, snapshot({ at: start + h * HOUR, tyres: tyres(tempC) })); });
	}
	return history;
}
const even = (kpa) => () => ({ fl: kpa, fr: kpa, rl: kpa, rr: kpa });

test('compensation brings a reading to what the same air shows at 20 C', () => {
	assert.ok(Math.abs(compensate(240, 20) - 240) < 1e-9);
	assert.ok(Math.abs(compensate(250, 30) - 238.408) < 0.01, String(compensate(250, 30)));
	assert.ok(compensate(240, 10) > 240, 'a cold morning reads low for the air inside');
	assert.ok(Math.abs(compensate(warm(240, 35), 35) - 240) < 1e-9, 'compensate undoes warming');
});

test('learning under five cold days; readings in the first two hours of a park or without tyres do not count', () => {
	assert.deepEqual(assessTyres(EMPTY_HISTORY, T0), { verdict: 'learning', reason: '0 of 5 cold days measured' });
	assert.equal(assessTyres(tyreHistory(4, even(240)), T0).reason, '4 of 5 cold days measured');
	assert.equal(assessTyres(tyreHistory(8, even(240), { hoursIn: [0.5, 1] }), T0).verdict, 'learning', 'warm readings are not cold readings');
	assert.equal(assessTyres(tyreHistory(8, even(240), { tyres: false }), T0).verdict, 'learning', 'no tyre data while the car reports none');
	assert.equal(assessTyres(tyreHistory(5, even(240)), T0).verdict, 'steady');
});

test('steady when all four hold, with each trend near zero and the cold pressure compensated', () => {
	const h = assessTyres(tyreHistory(10, even(240)), T0);
	assert.equal(h.verdict, 'steady');
	assert.equal(h.reason, 'All four are holding pressure over 10 days');
	assert.deepEqual(h.tyres.map((t) => t.wheel), ['fl', 'fr', 'rl', 'rr']);
	h.tyres.forEach((t) => {
		assert.ok(Math.abs(t.kpa20 - 240) < 0.01, t.wheel + ' kpa20 ' + t.kpa20);
		assert.ok(Math.abs(t.kpaPerWeek) < 0.01, t.wheel + ' trend ' + t.kpaPerWeek);
	});
});

test('one wheel falling 0.7 kPa a day and 0.5 kPa a day faster than its siblings is a leak', () => {
	const h = assessTyres(tyreHistory(14, (i) => ({ fl: 240, fr: 241, rl: 245 - 1.0 * i, rr: 239 })), T0);
	assert.equal(h.verdict, 'leak');
	assert.equal(h.wheel, 'rl');
	assert.equal(h.reason, 'Rear left is losing 1.0 kPa a day, 1.0 kPa a day faster than the other three');
	const rl = h.tyres.filter((t) => t.wheel === 'rl')[0];
	assert.ok(Math.abs(rl.kpaPerWeek + 7) < 0.01, String(rl.kpaPerWeek));
	assert.ok(Math.abs(rl.kpa20 - 232) < 0.01);
	const slow = assessTyres(tyreHistory(14, (i) => ({ fl: 240, fr: 240, rl: 240 - 0.5 * i, rr: 240 })), T0);
	assert.equal(slow.verdict, 'steady', 'half a kPa a day is within normal diffusion');
	const weather = assessTyres(tyreHistory(14, (i) => ({ fl: 240 - 0.4 * i, fr: 240 - 0.4 * i, rl: 244 - 1.4 * i, rr: 240 - 0.4 * i })), T0);
	assert.equal(weather.verdict, 'leak', 'a leak shows through a cooling week');
	assert.equal(weather.wheel, 'rl');
	const front = assessTyres(tyreHistory(14, (i) => ({ fl: 240 - 0.9 * i, fr: 240, rl: 240, rr: 240 })), T0);
	assert.equal(front.wheel, 'fl');
	assert.match(front.reason, /^Front left is losing 0\.9 kPa a day/);
});

test('all four falling together is steady and the reason says so', () => {
	const h = assessTyres(tyreHistory(10, (i) => ({ fl: 240 - i, fr: 241 - i, rl: 239 - i, rr: 240 - i })), T0);
	assert.equal(h.verdict, 'steady');
	assert.equal(h.reason, 'All four are losing pressure together, as weather does');
	const close = assessTyres(tyreHistory(10, (i) => ({ fl: 240 - 0.9 * i, fr: 240 - 0.9 * i, rl: 240 - 1.2 * i, rr: 240 - 0.9 * i })), T0);
	assert.equal(close.verdict, 'steady', '0.3 kPa a day faster than the siblings is not a leak');
	assert.equal(close.reason, 'All four are losing pressure together, as weather does');
});

test('only the last 21 days count and a single odd day does not move a Theil-Sen slope', () => {
	const old = tyreHistory(30, (i) => ({ fl: 240, fr: 240, rl: i < 9 ? 300 : 240, rr: 240 }));
	assert.equal(assessTyres(old, T0).verdict, 'steady', 'a high rear left more than 21 days ago is outside the window');
	const spike = assessTyres(tyreHistory(12, (i) => ({ fl: 240, fr: 240, rl: i === 6 ? 200 : 240, rr: 240 })), T0);
	assert.equal(spike.verdict, 'steady');
	const rl = spike.tyres.filter((t) => t.wheel === 'rl')[0];
	assert.ok(Math.abs(rl.kpaPerWeek) < 0.01, 'one bad day: ' + rl.kpaPerWeek);
});
