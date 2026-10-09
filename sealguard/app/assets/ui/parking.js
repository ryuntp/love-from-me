// Runtime budget and the time-lapse plan. The dashboard and the hub call the same runtimeBudget on the same World, so the
// figure the owner reads and the cadence the host is given can never disagree.
import { fmt } from './format.js';
import { since, lastParkedAt, trend } from './telemetry.js';

/**
 * @typedef {{kind: 'learning', reason: string} | {kind: 'charging', reason: string}
 *   | {kind: 'estimate', hours: number, limitedBy: 'soc'|'v12', basis: 'thisPark'|'pastParks'|'assumed', reason: string}} RuntimeBudget
 * basis is where the limiting rate came from. assumed is the draw used before any park has been measured: 0.3 percent of
 * charge an hour and no 12V draw. hours is 0 once the limiting floor is reached.
 */
/** @typedef {{kind: 'off', reason: string} | {kind: 'run', intervalS: number, reason: string}} LapsePlan */

const HOUR = 3600e3;
const MEASURE_MS = 30 * 60e3;
/** The 12V carries surface charge for the first hours of a park, so its rate is read only from samples this far in, the rest rule battery.js uses. */
const REST_AFTER_MS = 2 * HOUR;
const PAST_PARKS = 7;
const ASSUMED = { soc: -0.3, v12: 0 };
const MIN_LAPSE_HOURS = 2;
const MAX_FRAMES = 900;
/** Frame intervals in seconds; snapping to a band keeps small budget changes from touching the host. */
const BANDS = [10, 20, 30, 60, 120, 300];
/** A running band is kept until the ideal one is this many steps away, so an estimate drifting across a band edge cannot flap the host. */
const BAND_HYSTERESIS = 2;

function median(values) {
	const sorted = values.slice().sort(function (a, b) { return a - b; });
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function draining(s) { return s.power === 'off' && s.charge.state !== 'charging'; }
/** Slope per hour of one field over the samples, or null under three samples or thirty minutes. */
function slopeOf(samples, key) {
	if (samples.length < 3 || samples[samples.length - 1].at - samples[0].at < MEASURE_MS) return null;
	const start = samples[0].at;
	const fit = trend(samples.map(function (s) { return [(s.at - start) / HOUR, s[key]]; }));
	return fit === null ? null : fit.slope;
}
/** Both rates of one park's draining stretch, each null while unmeasurable. */
function parkRates(samples, parkStart) {
	return { soc: slopeOf(samples, 'soc'), v12: slopeOf(samples.filter(function (s) { return s.at - parkStart >= REST_AFTER_MS; }), 'v12') };
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
	return parks.slice(-PAST_PARKS).map(function (samples) { return parkRates(samples, samples[0].at); });
}
/** One rate with its basis: this park when measured, else the median of the past parks that measured it, else the assumed draw. */
function choose(key, thisPark, past) {
	if (thisPark[key] !== null) return { rate: thisPark[key], basis: 'thisPark' };
	const rates = past.map(function (r) { return r[key]; }).filter(function (r) { return r !== null; });
	if (rates.length) return { rate: median(rates), basis: 'pastParks' };
	return { rate: ASSUMED[key], basis: 'assumed' };
}

function hoursTo(value, floor, rate) {
	if (value <= floor) return 0;
	return rate < 0 ? (value - floor) / -rate : Infinity;
}
function rateWords(limitedBy, rate) {
	return limitedBy === 'soc' ? (-rate).toFixed(1) + '% an hour' : Math.round(-rate * 1000) + ' mV an hour';
}
const BASIS_WORDS = { thisPark: 'measured this park', pastParks: 'from recent parks', assumed: 'assumed until measured' };
const FLOOR_WORDS = { soc: 'charge floor', v12: '12V floor' };

/** Hours until the first floor is reached, or 0 once one is. Each rate comes from this park once measured, the charge after 30 min and the 12V after two hours, else the median of the last seven parks, else an assumed draw. @param {History} history @param {Config} config @param {Millis} now @returns {RuntimeBudget} */
export function runtimeBudget(history, config, now) {
	const latest = history.latest;
	if (latest === null) return { kind: 'learning', reason: 'Waiting for the first reading' };
	if (latest.charge.state === 'charging') return { kind: 'charging', reason: 'Charging at ' + fmt.kw(latest.charge.kw) };
	if (latest.power !== 'off') return { kind: 'learning', reason: 'Measured once the car parks' };
	const parkStart = lastParkedAt(history);
	const thisPark = parkRates(since(history, parkStart).filter(draining), parkStart);
	const past = thisPark.soc === null || thisPark.v12 === null ? pastParkRates(history, parkStart) : [];
	const soc = choose('soc', thisPark, past);
	const v12 = choose('v12', thisPark, past);
	const socHours = hoursTo(latest.soc, config.socFloor, soc.rate);
	const v12Hours = hoursTo(latest.v12, config.v12Floor, v12.rate);
	if (socHours === Infinity && v12Hours === Infinity) return { kind: 'learning', reason: 'Neither battery is falling yet' };
	const limitedBy = socHours <= v12Hours ? 'soc' : 'v12';
	const picked = limitedBy === 'soc' ? soc : v12;
	const hours = Math.min(socHours, v12Hours);
	return { kind: 'estimate', hours: hours, limitedBy: limitedBy, basis: picked.basis,
		reason: hours === 0 ? 'At the ' + FLOOR_WORDS[limitedBy] : rateWords(limitedBy, picked.rate) + ' ' + BASIS_WORDS[picked.basis] + ', to the ' + FLOOR_WORDS[limitedBy] };
}

/** Frame interval for this park's single clip, snapped to fixed bands so small budget changes never touch the host; a band already running is kept until the ideal one is two steps away. Off when disabled, charging or under two hours of budget. @param {RuntimeBudget} budget @param {Config} config @param {number|null} [current] the interval now running for this park @returns {LapsePlan} */
export function lapsePlan(budget, config, current) {
	if (!config.lapse) return { kind: 'off', reason: 'Off in Settings' };
	if (budget.kind === 'charging') return { kind: 'off', reason: 'Paused while charging' };
	if (budget.kind === 'learning') return { kind: 'off', reason: 'Waiting for a runtime estimate' };
	if (budget.hours < MIN_LAPSE_HOURS) return { kind: 'off', reason: 'Under two hours of runtime left' };
	const fits = BANDS.filter(function (s) { return budget.hours * 3600 / s <= MAX_FRAMES; });
	const ideal = fits.length ? fits[0] : BANDS[BANDS.length - 1];
	const running = current === null || current === undefined ? -1 : BANDS.indexOf(current);
	const intervalS = running >= 0 && Math.abs(running - BANDS.indexOf(ideal)) < BAND_HYSTERESIS ? current : ideal;
	const frames = Math.round(budget.hours * 3600 / intervalS);
	return { kind: 'run', intervalS: intervalS, reason: 'One frame every ' + fmt.span(intervalS * 1000) + ', about ' + frames + ' frames' };
}
