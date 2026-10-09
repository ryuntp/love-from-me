// 12V battery health from the kept history: nightly resting voltage, its slope over nights, and the sag after each wake.
import { fmt } from './format.js';
import { since, dayKey } from './telemetry.js';

/**
 * @typedef {{verdict: 'learning', reason: string, nights: {at: Millis, volts: Volts}[]}
 *   | {verdict: 'good'|'watch'|'replace', reason: string, nights: {at: Millis, volts: Volts}[], restingV: Volts, slopePerDay: number, sagV: Volts|null}} BatteryHealth
 */

const HOUR = 3600e3;
const DAY = 24 * HOUR;
/** A reading counts as resting this long into a park with no charging. */
const REST_AFTER_MS = 2 * HOUR;
/** The sag is the drop within this window after a power change from off. */
const SAG_WINDOW_MS = 60e3;
/** Nights are counted noon to noon, so a park that rests across midnight is one night and not two. */
const NIGHT_SHIFT_MS = 12 * HOUR;
/** Thresholds for the lithium iron phosphate 12V battery; the one table every verdict reads. */
export const LFP_12V = { restGood: 13.0, restWatch: 12.7, slopeWatchPerDay: -0.015, slopeNights: 5, sagWatch: 0.6, sagReplace: 1.2, minNights: 3 };

function median(values) {
	const sorted = values.slice().sort(function (a, b) { return a - b; });
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** One resting voltage per night: the median of samples two hours or more into a park with no charging. */
function restingNights(series) {
	const byDay = new Map();
	let parkStart = null;
	series.forEach(function (s) {
		if (s.power !== 'off') { parkStart = null; return; }
		if (parkStart === null) parkStart = s.at;
		if (s.charge.state === 'charging' || s.at - parkStart < REST_AFTER_MS) return;
		const key = dayKey(s.at - NIGHT_SHIFT_MS);
		if (!byDay.has(key)) byDay.set(key, { at: s.at, volts: [] });
		byDay.get(key).volts.push(s.v12);
	});
	return Array.from(byDay.values()).map(function (n) { return { at: n.at, volts: median(n.volts) }; });
}

/** The drop from the last parked reading to the lowest reading within the sag window after the latest wake, or null without one. */
function latestSag(series) {
	for (let i = series.length - 1; i > 0; i--) {
		if (series[i].power === 'off' || series[i - 1].power !== 'off') continue;
		let low = series[i].v12;
		for (let j = i + 1; j < series.length && series[j].at - series[i].at <= SAG_WINDOW_MS; j++) low = Math.min(low, series[j].v12);
		return series[i - 1].v12 - low;
	}
	return null;
}

function slopePerDay(nights) {
	if (nights.length < 2) return 0;
	const first = nights[0];
	let sxx = 0;
	let sxy = 0;
	let mx = 0;
	let my = 0;
	nights.forEach(function (n) { mx += (n.at - first.at) / DAY / nights.length; my += n.volts / nights.length; });
	nights.forEach(function (n) { const x = (n.at - first.at) / DAY - mx; sxx += x * x; sxy += x * (n.volts - my); });
	return sxx === 0 ? 0 : sxy / sxx;
}

/** Judges the 12V battery from nightly resting voltage, taken two hours into a park with no charging, and from the sag after each wake; the reason names the signal that decided. @param {History} history @param {Millis} now @returns {BatteryHealth} */
export function assessBattery(history, now) {
	const series = since(history, 0);
	const nights = restingNights(series);
	if (nights.length < LFP_12V.minNights) {
		return { verdict: 'learning', reason: nights.length + ' of ' + LFP_12V.minNights + ' resting nights measured', nights: nights };
	}
	const restingV = nights[nights.length - 1].volts;
	const slope = slopePerDay(nights);
	const sagV = latestSag(series);
	const result = function (verdict, reason) { return { verdict: verdict, reason: reason, nights: nights, restingV: restingV, slopePerDay: slope, sagV: sagV }; };
	if (restingV < LFP_12V.restWatch) return result('replace', 'Rests at ' + fmt.volts(restingV) + ', under ' + fmt.volts(LFP_12V.restWatch));
	if (sagV !== null && sagV > LFP_12V.sagReplace) return result('replace', 'Sags ' + sagV.toFixed(1) + ' V on wake, over ' + LFP_12V.sagReplace.toFixed(1) + ' V');
	if (restingV < LFP_12V.restGood) return result('watch', 'Rests at ' + fmt.volts(restingV) + ', under ' + fmt.volts(LFP_12V.restGood));
	if (nights.length >= LFP_12V.slopeNights && slope < LFP_12V.slopeWatchPerDay) return result('watch', 'Falling ' + Math.round(-slope * 1000) + ' mV a day over ' + nights.length + ' nights');
	if (sagV !== null && sagV > LFP_12V.sagWatch) return result('watch', 'Sags ' + sagV.toFixed(1) + ' V on wake, over ' + LFP_12V.sagWatch.toFixed(1) + ' V');
	return result('good', 'Rests at ' + fmt.volts(restingV) + ' over ' + nights.length + ' nights');
}
