// Tyre slow-leak detection: cold pressures compensated to 20 C, one median per wheel per day, a Theil-Sen slope per wheel,
// and the leak call made against the siblings so weather, which moves all four, cancels out.
import { since, dayKey } from './telemetry.js';

/** @typedef {{wheel: Wheel, kpa20: Kpa, kpaPerWeek: number}} TyreTrend  kpa20 is cold pressure compensated to 20 degrees C */
/**
 * @typedef {{verdict: 'learning', reason: string}
 *   | {verdict: 'steady', reason: string, tyres: TyreTrend[]}
 *   | {verdict: 'watch', reason: string, wheels: Wheel[], tyres: TyreTrend[]}
 *   | {verdict: 'leak', reason: string, wheel: Wheel, wheels: Wheel[], tyres: TyreTrend[]}} TyreHealth
 * leak names every wheel that meets both rules, wheel being the fastest. watch is loss at the leak rate that no sibling
 * comparison can pin on one wheel, so the pressures need checking. steady means no wheel reaches the leak rate.
 */

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

function list(words) { return words.length === 1 ? words[0] : words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1]; }
/** The wheel names as a sentence subject, only the first capitalised. */
function names(wheels) {
	return list(wheels.map(function (w, i) { return i === 0 ? WHEEL_NAMES[w] : WHEEL_NAMES[w].toLowerCase(); }));
}
function losing(wheels, perDay) {
	return names(wheels) + (wheels.length === 1 ? ' is losing ' : ' are losing ') + list(wheels.map(function (w) { return (-perDay[w]).toFixed(1); })) + ' kPa a day';
}

/** Fits each tyre's compensated cold pressure over 21 days. A wheel falling at least 0.7 kPa a day and 0.5 kPa a day faster than its siblings' median is a leak, and every such wheel is named; comparing siblings cancels weather. Loss at the leak rate with no wheel standing out is watch, and steady is only for a set where no wheel reaches it. @param {History} history @param {Millis} now @returns {TyreHealth} */
export function assessTyres(history, now) {
	const days = coldDays(since(history, now - WINDOW_DAYS * DAY), now - WINDOW_DAYS * DAY);
	if (days.length < MIN_DAYS) return { verdict: 'learning', reason: days.length + ' of ' + MIN_DAYS + ' cold days measured' };
	const first = days[0].at;
	const perDay = {};
	const tyres = WHEELS.map(function (w) {
		perDay[w] = theilSen(days.map(function (d) { return [(d.at - first) / DAY, d.wheels[w]]; }));
		return { wheel: w, kpa20: days[days.length - 1].wheels[w], kpaPerWeek: perDay[w] * 7 };
	});
	const siblings = {};
	WHEELS.forEach(function (w) { siblings[w] = median(WHEELS.filter(function (o) { return o !== w; }).map(function (o) { return perDay[o]; })); });
	const fast = WHEELS.filter(function (w) { return perDay[w] <= -LEAK_PER_DAY; });
	const leaks = fast.filter(function (w) { return perDay[w] <= siblings[w] - FASTER_THAN_SIBLINGS; });
	if (leaks.length) {
		const worst = leaks.reduce(function (a, b) { return perDay[b] < perDay[a] ? b : a; });
		const reason = leaks.length === 1
			? losing(leaks, perDay) + ', ' + (siblings[worst] - perDay[worst]).toFixed(1) + ' kPa a day faster than the other three'
			: losing(leaks, perDay);
		return { verdict: 'leak', wheel: worst, wheels: leaks, tyres: tyres, reason: reason };
	}
	if (fast.length === WHEELS.length) {
		const weekly = Math.round(-median(WHEELS.map(function (w) { return perDay[w]; })) * 7);
		return { verdict: 'watch', wheels: fast, tyres: tyres, reason: 'All four are losing about ' + weekly + ' kPa a week, so check the pressures' };
	}
	if (fast.length) return { verdict: 'watch', wheels: fast, tyres: tyres, reason: losing(fast, perDay) + ', so check the pressures' };
	const slow = WHEELS.filter(function (w) { return perDay[w] <= -LEAK_PER_DAY / 2; });
	return { verdict: 'steady', tyres: tyres,
		reason: slow.length ? losing(slow, perDay) + ', under the ' + LEAK_PER_DAY + ' that marks a leak' : 'All four are holding pressure over ' + days.length + ' days' };
}
