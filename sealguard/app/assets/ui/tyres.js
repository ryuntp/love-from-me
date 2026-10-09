// Tyre slow-leak detection: cold pressures compensated to 20 C, one median per wheel per day, a Theil-Sen slope per wheel,
// and the leak call made against the siblings so weather, which moves all four, cancels out.
import { since, dayKey } from './telemetry.js';

/** @typedef {{wheel: Wheel, kpa20: Kpa, kpaPerWeek: number}} TyreTrend  kpa20 is cold pressure compensated to 20 degrees C */
/** @typedef {{verdict: 'learning', reason: string} | {verdict: 'steady', reason: string, tyres: TyreTrend[]} | {verdict: 'leak', reason: string, wheel: Wheel, tyres: TyreTrend[]}} TyreHealth */

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const WHEELS = ['fl', 'fr', 'rl', 'rr'];
const WHEEL_NAMES = { fl: 'Front left', fr: 'Front right', rl: 'Rear left', rr: 'Rear right' };
const ATMOSPHERE_KPA = 101.325;
const COLD_AFTER_MS = 2 * HOUR;
/** Cold days are counted noon to noon, so an overnight park is one day of readings. */
const DAY_SHIFT_MS = 12 * HOUR;
const WINDOW_DAYS = 21;
const MIN_DAYS = 5;
/** A wheel leaks when it falls at least this fast and at least this much faster than the median of its siblings, in kPa a day. */
const LEAK_PER_DAY = 0.7;
const FASTER_THAN_SIBLINGS = 0.5;

/** Gauge pressure the same air would show at 20 C, by the ideal gas law on absolute pressure. @param {Kpa} kpa @param {Celsius} tempC @returns {Kpa} */
export function compensate(kpa, tempC) {
	return (kpa + ATMOSPHERE_KPA) * (293.15 / (273.15 + tempC)) - ATMOSPHERE_KPA;
}

function median(values) {
	const sorted = values.slice().sort(function (a, b) { return a - b; });
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median of all pairwise slopes, which one odd day cannot drag. @param {[number, number][]} points */
function theilSen(points) {
	const slopes = [];
	for (let i = 0; i < points.length; i++) {
		for (let j = i + 1; j < points.length; j++) {
			if (points[j][0] !== points[i][0]) slopes.push((points[j][1] - points[i][1]) / (points[j][0] - points[i][0]));
		}
	}
	return slopes.length ? median(slopes) : 0;
}

/** Per wheel, one compensated cold pressure per overnight day from samples two hours or more into a park. */
function coldDays(series, from) {
	const days = new Map();
	let parkStart = null;
	series.forEach(function (s) {
		if (s.power !== 'off') { parkStart = null; return; }
		if (parkStart === null) parkStart = s.at;
		if (s.tyres === null || s.at < from || s.at - parkStart < COLD_AFTER_MS) return;
		const key = dayKey(s.at - DAY_SHIFT_MS);
		if (!days.has(key)) days.set(key, { at: s.at, wheels: { fl: [], fr: [], rl: [], rr: [] } });
		const day = days.get(key);
		WHEELS.forEach(function (w) { day.wheels[w].push(compensate(s.tyres[w].kpa, s.tyres[w].tempC)); });
	});
	return Array.from(days.values()).map(function (d) {
		const out = { at: d.at, wheels: {} };
		WHEELS.forEach(function (w) { out.wheels[w] = median(d.wheels[w]); });
		return out;
	});
}

/** Fits each tyre's compensated cold pressure over 21 days and flags the one falling at least 0.7 kPa a day and 0.5 kPa a day faster than its siblings' median; comparing siblings cancels weather. @param {History} history @param {Millis} now @returns {TyreHealth} */
export function assessTyres(history, now) {
	const days = coldDays(since(history, now - WINDOW_DAYS * DAY), now - WINDOW_DAYS * DAY);
	if (days.length < MIN_DAYS) return { verdict: 'learning', reason: days.length + ' of ' + MIN_DAYS + ' cold days measured' };
	const first = days[0].at;
	const perDay = {};
	const tyres = WHEELS.map(function (w) {
		perDay[w] = theilSen(days.map(function (d) { return [(d.at - first) / DAY, d.wheels[w]]; }));
		return { wheel: w, kpa20: days[days.length - 1].wheels[w], kpaPerWeek: perDay[w] * 7 };
	});
	let leak = null;
	WHEELS.forEach(function (w) {
		const siblings = median(WHEELS.filter(function (o) { return o !== w; }).map(function (o) { return perDay[o]; }));
		if (perDay[w] <= -LEAK_PER_DAY && perDay[w] <= siblings - FASTER_THAN_SIBLINGS && (leak === null || perDay[w] < perDay[leak.wheel])) leak = { wheel: w, siblings: siblings };
	});
	if (leak !== null) {
		const rate = -perDay[leak.wheel];
		return { verdict: 'leak', wheel: leak.wheel, tyres: tyres,
			reason: WHEEL_NAMES[leak.wheel] + ' is losing ' + rate.toFixed(1) + ' kPa a day, ' + (leak.siblings - perDay[leak.wheel]).toFixed(1) + ' kPa a day faster than the other three' };
	}
	const together = WHEELS.every(function (w) { return perDay[w] <= -LEAK_PER_DAY; });
	return { verdict: 'steady', tyres: tyres, reason: together ? 'All four are losing pressure together, as weather does' : 'All four are holding pressure over ' + days.length + ' days' };
}
