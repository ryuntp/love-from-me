// Snapshot history at two resolutions: recent at full rate in memory, kept sparse for weeks on disk. One retention policy
// feeds incident packs, the runtime budget, 12V rest and sag, and cold tyre readings.
/** @typedef {number} Millis */ /** @typedef {number} Volts */ /** @typedef {number} Pct */ /** @typedef {number} Kpa */ /** @typedef {number} Celsius */
/** @typedef {'fl'|'fr'|'rl'|'rr'} Wheel */
/** @typedef {{state: 'unplugged'} | {state: 'plugged'} | {state: 'charging', kw: number, dc: boolean}} Charge */
/** @typedef {{at: Millis, power: 'off'|'acc'|'on', locked: boolean, charge: Charge, v12: Volts, v12Low: boolean, hvV: Volts, soc: Pct,
 *   tyres: Record<Wheel, {kpa: Kpa, tempC: Celsius}>|null}} VehicleSnapshot  v12Low is the host's own 12V low flag; tyres is null while the car reports none */
/** @typedef {{latest: VehicleSnapshot|null, recent: VehicleSnapshot[], kept: VehicleSnapshot[]}} History  kept changes reference only when a sample is kept, which is how createApp knows to persist */
/** @typedef {{slope: number, intercept: number, n: number}} Fit */
/** @typedef {{getItem(k: string): string|null, setItem(k: string, v: string): void, removeItem(k: string): void, key(i: number): string|null, length: number}} StorageLike */

/** Retention policy for the in-memory series. */
export const KEEP = { recentMs: 10 * 60e3, everyMs: 10 * 60e3, afterTransitionMs: 15e3, days: 31 };
/** @type {History} */
export const EMPTY_HISTORY = { latest: null, recent: [], kept: [] };

const DAY = 24 * 3600e3;
const PREFIX = 'sealguard.history.';
/** Whole days stay on disk past KEEP.days so the newest-day write never has to split or merge a day. */
const STORED_DAYS = 45;
const POWERS = ['off', 'acc', 'on'];
const CHARGE_STATES = ['unplugged', 'plugged', 'charging'];
const WHEELS = ['fl', 'fr', 'rl', 'rr'];

function transitioned(a, b) { return a.power !== b.power || a.locked !== b.locked || a.charge.state !== b.charge.state; }

function lastPowerChangeAt(series) {
	for (let i = series.length - 1; i > 0; i--) if (series[i].power !== series[i - 1].power) return series[i].at;
	return null;
}

/** Adds one snapshot, drops out-of-order ones, keeps every power, lock and charge transition and the window after a power change. @param {History} history @param {VehicleSnapshot} snapshot @returns {History} */
export function record(history, snapshot) {
	const latest = history.latest;
	const lastKept = history.kept.length ? history.kept[history.kept.length - 1] : null;
	if ((latest !== null && snapshot.at <= latest.at) || (lastKept !== null && snapshot.at <= lastKept.at)) return history;
	const recent = history.recent.filter(function (s) { return s.at >= snapshot.at - KEEP.recentMs; }).concat([snapshot]);
	let keep = latest === null || lastKept === null || transitioned(latest, snapshot) || snapshot.at - lastKept.at >= KEEP.everyMs;
	if (!keep) {
		const change = lastPowerChangeAt(recent);
		keep = change !== null && snapshot.at - change <= KEEP.afterTransitionMs;
	}
	const kept = keep ? history.kept.filter(function (s) { return s.at > snapshot.at - KEEP.days * DAY; }).concat([snapshot]) : history.kept;
	return { latest: snapshot, recent: recent, kept: kept };
}

/** Snapshots at or after from, kept and recent merged in time order. @param {History} history @param {Millis} from @returns {VehicleSnapshot[]} */
export function since(history, from) {
	const recent = history.recent;
	const cut = recent.length ? recent[0].at : Infinity;
	const out = [];
	history.kept.forEach(function (s) { if (s.at >= from && s.at < cut) out.push(s); });
	recent.forEach(function (s) { if (s.at >= from) out.push(s); });
	return out;
}

/** Start of the current park, or null when the latest snapshot is not parked. @param {History} history @returns {Millis|null} */
export function lastParkedAt(history) {
	if (history.latest === null || history.latest.power !== 'off') return null;
	const all = since(history, 0);
	let start = history.latest.at;
	for (let i = all.length - 1; i >= 0 && all[i].power === 'off'; i--) start = all[i].at;
	return start;
}

/** Least-squares line through the points; null under three points or with no spread in x. @param {[number, number][]} points @returns {Fit|null} */
export function trend(points) {
	const n = points.length;
	if (n < 3) return null;
	let mx = 0;
	let my = 0;
	points.forEach(function (p) { mx += p[0] / n; my += p[1] / n; });
	let sxx = 0;
	let sxy = 0;
	points.forEach(function (p) { sxx += (p[0] - mx) * (p[0] - mx); sxy += (p[0] - mx) * (p[1] - my); });
	if (sxx === 0) return null;
	const slope = sxy / sxx;
	return { slope: slope, intercept: my - slope * mx, n: n };
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }
/** Local calendar day of a moment, the unit of one storage key. @param {Millis} at @returns {string} */
export function dayKey(at) {
	const d = new Date(at);
	return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function dayStart(key) {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
	return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : NaN;
}

function finite(v) { return typeof v === 'number' && isFinite(v); }
function round(v, digits) { const f = Math.pow(10, digits); return Math.round(v * f) / f; }

function pack(s) {
	const c = s.charge;
	const t = s.tyres;
	return [
		s.at, s.power, s.locked ? 1 : 0, c.state, c.state === 'charging' ? round(c.kw, 1) : 0, c.state === 'charging' && c.dc ? 1 : 0,
		round(s.v12, 3), s.v12Low ? 1 : 0, round(s.hvV, 1), round(s.soc, 1),
		t === null ? null : WHEELS.reduce(function (acc, w) { return acc.concat([round(t[w].kpa, 1), round(t[w].tempC, 1)]); }, []),
	];
}

function unpack(row) {
	if (!Array.isArray(row) || row.length !== 11) return null;
	const [at, power, locked, state, kw, dc, v12, v12Low, hvV, soc, tyres] = row;
	if (!finite(at) || at < 0 || POWERS.indexOf(power) === -1 || CHARGE_STATES.indexOf(state) === -1) return null;
	if (!finite(kw) || !finite(v12) || !finite(hvV) || !finite(soc)) return null;
	let wheels = null;
	if (tyres !== null) {
		if (!Array.isArray(tyres) || tyres.length !== 8 || !tyres.every(finite)) return null;
		wheels = {};
		WHEELS.forEach(function (w, i) { wheels[w] = { kpa: tyres[2 * i], tempC: tyres[2 * i + 1] }; });
	}
	const charge = state === 'charging' ? { state: state, kw: kw, dc: dc === 1 } : { state: state };
	return { at: at, power: power, locked: locked === 1, charge: charge, v12: v12, v12Low: v12Low === 1, hvV: hvV, soc: soc, tyres: wheels };
}

function historyKeys(storage) {
	const keys = [];
	for (let i = 0; i < storage.length; i++) {
		const k = storage.key(i);
		if (k !== null && k.indexOf(PREFIX) === 0 && !isNaN(dayStart(k.slice(PREFIX.length)))) keys.push(k);
	}
	return keys.sort();
}

/** Reads every per-day key, drops invalid tuples and stale days, returns history with kept filled. @param {StorageLike} storage @param {Millis} now @returns {History} */
export function loadHistory(storage, now) {
	const kept = [];
	try {
		historyKeys(storage).forEach(function (k) {
			if (dayStart(k.slice(PREFIX.length)) + DAY <= now - STORED_DAYS * DAY) return;
			let rows = null;
			try { rows = JSON.parse(storage.getItem(k)); } catch (e) { rows = null; }
			if (!Array.isArray(rows)) return;
			rows.forEach(function (row) {
				const s = unpack(row);
				if (s !== null && (kept.length === 0 || s.at > kept[kept.length - 1].at)) kept.push(s);
			});
		});
	} catch (e) {
		return EMPTY_HISTORY;
	}
	return { latest: null, recent: [], kept: kept };
}

/** Rewrites only the day key of the newest kept sample and prunes stale days; on a refused write it drops the oldest day and retries, and reports false when nothing more can give. @param {StorageLike} storage @param {History} history @returns {boolean} */
export function saveHistory(storage, history) {
	const kept = history.kept;
	if (kept.length === 0) return true;
	const key = dayKey(kept[kept.length - 1].at);
	let first = kept.length - 1;
	while (first > 0 && dayKey(kept[first - 1].at) === key) first--;
	const text = JSON.stringify(kept.slice(first).map(pack));
	try {
		const keys = historyKeys(storage).filter(function (k) { return k !== PREFIX + key; });
		const horizon = kept[kept.length - 1].at - STORED_DAYS * DAY;
		while (keys.length && dayStart(keys[0].slice(PREFIX.length)) + DAY <= horizon) storage.removeItem(keys.shift());
		for (;;) {
			try {
				storage.setItem(PREFIX + key, text);
				return true;
			} catch (e) {
				if (keys.length === 0) return false;
				storage.removeItem(keys.shift());
			}
		}
	} catch (e) {
		return false;
	}
}
