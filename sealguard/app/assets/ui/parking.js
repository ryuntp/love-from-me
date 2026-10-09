// Runtime budget and the time-lapse plan. The dashboard and the hub call the same runtimeBudget on the same World, so the
// figure the owner reads and the cadence the host is given can never disagree.
import { fmt } from './format.js';
import { since, lastParkedAt, trend } from './telemetry.js';

/**
 * @typedef {{kind: 'learning', reason: string} | {kind: 'charging', reason: string}
 *   | {kind: 'estimate', hours: number, limitedBy: 'soc'|'v12', basis: 'thisPark'|'pastParks'|'assumed', reason: string}} RuntimeBudget
 * assumed is the draw used before any park has been measured: 0.3 percent of charge an hour and no 12V draw.
 */
/** @typedef {{kind: 'off', reason: string} | {kind: 'run', intervalS: number, reason: string}} LapsePlan */

const HOUR = 3600e3;
const MEASURE_MS = 30 * 60e3;
const PAST_PARKS = 7;
const ASSUMED = { soc: -0.3, v12: 0 };
const MIN_LAPSE_HOURS = 2;
const MAX_FRAMES = 900;
/** Frame intervals in seconds; snapping to a band keeps small budget changes from touching the host. */
const BANDS = [10, 20, 30, 60, 120, 300];

function median(values) {
	const sorted = values.slice().sort(function (a, b) { return a - b; });
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function draining(s) { return s.power === 'off' && s.charge.state !== 'charging'; }
function rates(samples) {
	const start = samples[0].at;
	const hours = function (s) { return (s.at - start) / HOUR; };
	const soc = trend(samples.map(function (s) { return [hours(s), s.soc]; }));
	const v12 = trend(samples.map(function (s) { return [hours(s), s.v12]; }));
	return soc === null || v12 === null ? null : { soc: soc.slope, v12: v12.slope };
}
function measured(samples) {
	return samples.length >= 3 && samples[samples.length - 1].at - samples[0].at >= MEASURE_MS ? rates(samples) : null;
}

/** Draining stretches of earlier parks, newest last, each measured on its own. */
function pastParkRates(history, parkStart) {
	const parks = [];
	let run = [];
	since(history, 0).forEach(function (s) {
		if (s.at >= parkStart) return;
		if (draining(s)) run.push(s);
		else if (run.length) { parks.push(run); run = []; }
	});
	if (run.length) parks.push(run);
	return parks.slice(-PAST_PARKS).map(measured).filter(function (r) { return r !== null; });
}

function hoursTo(value, floor, rate) { return rate < 0 && value > floor ? (value - floor) / -rate : Infinity; }
function rateWords(limitedBy, rate) {
	return limitedBy === 'soc' ? (-rate).toFixed(1) + '% an hour' : Math.round(-rate * 1000) + ' mV an hour';
}
const BASIS_WORDS = { thisPark: 'measured this park', pastParks: 'from recent parks', assumed: 'assumed until measured' };
const FLOOR_WORDS = { soc: 'charge floor', v12: '12V floor' };

/** Hours until the first floor is reached, from this park's measured draw once 30 min are in, else the median draw of the last seven parks, else an assumed draw. @param {History} history @param {Config} config @param {Millis} now @returns {RuntimeBudget} */
export function runtimeBudget(history, config, now) {
	const latest = history.latest;
	if (latest === null) return { kind: 'learning', reason: 'Waiting for the first reading' };
	if (latest.charge.state === 'charging') return { kind: 'charging', reason: 'Charging at ' + fmt.kw(latest.charge.kw) };
	if (latest.power !== 'off') return { kind: 'learning', reason: 'Measured once the car parks' };
	const parkStart = lastParkedAt(history);
	const thisPark = measured(since(history, parkStart).filter(draining));
	let basis = 'thisPark';
	let rate = thisPark;
	if (rate === null) {
		const past = pastParkRates(history, parkStart);
		basis = past.length ? 'pastParks' : 'assumed';
		rate = past.length ? { soc: median(past.map(function (r) { return r.soc; })), v12: median(past.map(function (r) { return r.v12; })) } : ASSUMED;
	}
	const socHours = hoursTo(latest.soc, config.socFloor, rate.soc);
	const v12Hours = hoursTo(latest.v12, config.v12Floor, rate.v12);
	if (socHours === Infinity && v12Hours === Infinity) return { kind: 'learning', reason: 'Neither battery is falling yet' };
	const limitedBy = socHours <= v12Hours ? 'soc' : 'v12';
	const hours = Math.min(socHours, v12Hours);
	return { kind: 'estimate', hours: hours, limitedBy: limitedBy, basis: basis,
		reason: rateWords(limitedBy, rate[limitedBy]) + ' ' + BASIS_WORDS[basis] + ', to the ' + FLOOR_WORDS[limitedBy] };
}

/** Frame interval for this park's single clip, snapped to fixed bands so small budget changes never touch the host; off when disabled, charging or under two hours of budget. @param {RuntimeBudget} budget @param {Config} config @returns {LapsePlan} */
export function lapsePlan(budget, config) {
	if (!config.lapse) return { kind: 'off', reason: 'Off in Settings' };
	if (budget.kind === 'charging') return { kind: 'off', reason: 'Paused while charging' };
	if (budget.kind === 'learning') return { kind: 'off', reason: 'Waiting for a runtime estimate' };
	if (budget.hours < MIN_LAPSE_HOURS) return { kind: 'off', reason: 'Under two hours of runtime left' };
	const fits = BANDS.filter(function (s) { return budget.hours * 3600 / s <= MAX_FRAMES; });
	const intervalS = fits.length ? fits[0] : BANDS[BANDS.length - 1];
	const frames = Math.round(budget.hours * 3600 / intervalS);
	return { kind: 'run', intervalS: intervalS, reason: 'One frame every ' + fmt.span(intervalS * 1000) + ', about ' + frames + ' frames' };
}
