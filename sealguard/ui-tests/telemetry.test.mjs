import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage, snapshot, T0, MINUTE, HOUR, DAY } from './support.mjs';
import { KEEP, EMPTY_HISTORY, record, since, lastParkedAt, trend, loadHistory, saveHistory, dayKey } from '../app/assets/ui/telemetry.js';

function feed(history, snapshots) { return snapshots.reduce(record, history); }
function at(ms, over) { return snapshot(Object.assign({ at: T0 + ms }, over)); }

test('KEEP is the retention policy the architecture names', () => {
	assert.deepEqual(KEEP, { recentMs: 10 * MINUTE, everyMs: 10 * MINUTE, afterTransitionMs: 15e3, days: 31 });
	assert.deepEqual(EMPTY_HISTORY, { latest: null, recent: [], kept: [] });
});

test('one sample per ten minutes is kept while nothing changes, and recent holds the last ten minutes at full rate', () => {
	const samples = [];
	for (let s = 0; s <= 25 * 60; s += 10) samples.push(at(s * 1000));
	const h = feed(EMPTY_HISTORY, samples);
	assert.deepEqual(h.kept.map((s) => (s.at - T0) / MINUTE), [0, 10, 20]);
	assert.equal(h.latest.at, T0 + 25 * MINUTE);
	assert.equal(h.recent[0].at, T0 + 15 * MINUTE);
	assert.equal(h.recent.length, 61);
});

test('every power, lock and charge transition is kept, plus fifteen seconds after a power change', () => {
	const samples = [at(0)];
	for (let s = 1; s <= 60; s++) samples.push(at(s * 1000));
	samples.push(at(61e3, { power: 'on' }));
	for (let s = 62; s <= 120; s++) samples.push(at(s * 1000, { power: 'on' }));
	samples.push(at(121e3, { power: 'on', locked: false }));
	samples.push(at(122e3, { power: 'on', locked: false, charge: { state: 'plugged' } }));
	samples.push(at(123e3, { power: 'on', locked: false, charge: { state: 'charging', kw: 7, dc: false } }));
	samples.push(at(124e3, { power: 'on', locked: false, charge: { state: 'charging', kw: 7.1, dc: false } }));
	const h = feed(EMPTY_HISTORY, samples);
	const keptAt = h.kept.map((s) => (s.at - T0) / 1000);
	const expected = [0];
	for (let s = 61; s <= 76; s++) expected.push(s);
	expected.push(121, 122, 123);
	assert.deepEqual(keptAt, expected);
});

test('out-of-order and repeated snapshots are dropped and return the same history', () => {
	const h = feed(EMPTY_HISTORY, [at(0), at(1000)]);
	assert.equal(record(h, at(1000)), h);
	assert.equal(record(h, at(500)), h);
	const loaded = { latest: null, recent: [], kept: [at(0)] };
	assert.equal(record(loaded, at(0)), loaded);
	assert.equal(record(loaded, at(-1000)), loaded);
	assert.equal(record(loaded, at(1000)).kept.length, 2);
});

test('kept keeps its reference when nothing is kept and changes only when a sample is', () => {
	const h1 = record(EMPTY_HISTORY, at(0));
	const h2 = record(h1, at(1000));
	assert.equal(h2.kept, h1.kept);
	assert.notEqual(h2.recent, h1.recent);
	const h3 = record(h2, at(10 * MINUTE));
	assert.notEqual(h3.kept, h2.kept);
});

test('kept is trimmed to 31 days', () => {
	const h = feed(EMPTY_HISTORY, [at(-40 * DAY), at(-32 * DAY), at(-30 * DAY), at(0)]);
	assert.deepEqual(h.kept.map((s) => (s.at - T0) / DAY), [-30, 0]);
});

test('since merges kept and recent in time order without duplicates', () => {
	const samples = [];
	for (let s = 0; s <= 30 * 60; s += 30) samples.push(at(s * 1000));
	const h = feed(EMPTY_HISTORY, samples);
	const all = since(h, 0);
	const ats = all.map((s) => s.at);
	assert.deepEqual(ats, Array.from(new Set(ats)));
	assert.ok(ats.every((a, i) => i === 0 || a > ats[i - 1]));
	assert.equal(all[0].at, T0);
	assert.equal(all[all.length - 1].at, T0 + 30 * MINUTE);
	assert.equal(all.length, 2 + 21);
	assert.deepEqual(since(h, T0 + 29 * MINUTE).map((s) => (s.at - T0) / 1000), [1740, 1770, 1800]);
	assert.deepEqual(since(EMPTY_HISTORY, 0), []);
});

test('lastParkedAt is the first power-off sample of the current park and null while driving', () => {
	const h = feed(EMPTY_HISTORY, [at(0, { power: 'on' }), at(MINUTE, { power: 'on' }), at(2 * MINUTE), at(12 * MINUTE), at(22 * MINUTE)]);
	assert.equal(lastParkedAt(h), T0 + 2 * MINUTE);
	assert.equal(lastParkedAt(record(h, at(23 * MINUTE, { power: 'acc' }))), null);
	assert.equal(lastParkedAt(EMPTY_HISTORY), null);
	const alwaysParked = feed(EMPTY_HISTORY, [at(0), at(HOUR)]);
	assert.equal(lastParkedAt(alwaysParked), T0);
});

test('trend fits a line, needs three points and stays exact with epoch-millisecond x values', () => {
	assert.equal(trend([[0, 1], [1, 2]]), null);
	assert.equal(trend([[1, 1], [1, 2], [1, 3]]), null);
	const fit = trend([[0, 13.0], [1, 12.9], [2, 12.8], [3, 12.7]]);
	assert.ok(Math.abs(fit.slope + 0.1) < 1e-12);
	assert.ok(Math.abs(fit.intercept - 13.0) < 1e-12);
	assert.equal(fit.n, 4);
	const wide = trend([[T0, 240], [T0 + DAY, 239], [T0 + 2 * DAY, 238], [T0 + 3 * DAY, 237]]);
	assert.ok(Math.abs(wide.slope * DAY + 1) < 1e-6, String(wide.slope * DAY));
});

test('history round trips through per-day keys and only the newest day is rewritten', () => {
	const storage = memoryStorage();
	const yesterday = T0 - DAY;
	const h = feed(EMPTY_HISTORY, [
		at(-DAY, { v12: 12.95, soc: 64.5, hvV: 380.5, tyres: { fl: { kpa: 240.5, tempC: 24 }, fr: { kpa: 241, tempC: 24 }, rl: { kpa: 232, tempC: 23.5 }, rr: { kpa: 240, tempC: 23 } } }),
		at(-DAY + 10 * MINUTE, { power: 'on', locked: false, charge: { state: 'charging', kw: 7.2, dc: true }, tyres: null, v12Low: true }),
		at(0),
		at(10 * MINUTE),
	]);
	assert.equal(saveHistory(storage, h), true);
	assert.deepEqual(Object.keys(storage.dump()), ['sealguard.history.' + dayKey(T0)]);
	const loadedToday = loadHistory(storage, T0 + 10 * MINUTE);
	assert.deepEqual(loadedToday.kept, h.kept.slice(2));
	assert.equal(loadedToday.latest, null);
	assert.deepEqual(loadedToday.recent, []);

	const earlier = { latest: null, recent: [], kept: h.kept.slice(0, 2) };
	assert.equal(saveHistory(storage, earlier), true);
	assert.deepEqual(Object.keys(storage.dump()).sort(), ['sealguard.history.' + dayKey(yesterday), 'sealguard.history.' + dayKey(T0)]);
	assert.deepEqual(loadHistory(storage, T0 + 10 * MINUTE).kept, h.kept);
	const text = storage.getItem('sealguard.history.' + dayKey(yesterday));
	assert.ok(text.length < 400, 'tuples stay compact: ' + text.length);
});

test('loading drops invalid tuples, unreadable days and days older than 45 days', () => {
	const good = at(0);
	const row = JSON.parse(storage_row(good));
	const storage = memoryStorage({
		['sealguard.history.' + dayKey(T0)]: JSON.stringify([row, ['junk'], null, 7, row.slice(0, 10), row.map((v, i) => (i === 1 ? 'warp' : v)), row.map((v, i) => (i === 6 ? 'high' : v))]),
		['sealguard.history.' + dayKey(T0 - 10 * DAY)]: '{not json',
		['sealguard.history.' + dayKey(T0 - 50 * DAY)]: JSON.stringify([JSON.parse(storage_row(at(-50 * DAY)))]),
		['sealguard.history.' + dayKey(T0 - 44 * DAY)]: JSON.stringify([JSON.parse(storage_row(at(-44 * DAY)))]),
		'sealguard.history.not-a-day': JSON.stringify([row]),
		'sealguard.config': '{}',
	});
	const h = loadHistory(storage, T0);
	assert.deepEqual(h.kept.map((s) => (s.at - T0) / DAY), [-44, 0]);
	assert.deepEqual(h.kept[1], good);
});

function storage_row(s) {
	const storage = memoryStorage();
	saveHistory(storage, { latest: s, recent: [s], kept: [s] });
	return JSON.parse(storage.getItem('sealguard.history.' + dayKey(s.at))).map((r) => JSON.stringify(r))[0];
}

test('saving returns false on a refusing storage after giving up its oldest days, and prunes stale days', () => {
	const storage = memoryStorage({ ['sealguard.history.' + dayKey(T0 - 60 * DAY)]: '[]', ['sealguard.history.' + dayKey(T0 - 3 * DAY)]: '[]' });
	const h = feed(EMPTY_HISTORY, [at(0)]);
	assert.equal(saveHistory(storage, h), true);
	assert.deepEqual(Object.keys(storage.dump()).sort(), ['sealguard.history.' + dayKey(T0 - 3 * DAY), 'sealguard.history.' + dayKey(T0)]);
	storage.refuseWrites = true;
	assert.equal(saveHistory(storage, feed(h, [at(10 * MINUTE)])), false);
	assert.equal(saveHistory(storage, EMPTY_HISTORY), true);
	const broken = { get length() { throw new Error('gone'); }, key() { return null; }, getItem() { return null; }, setItem() {}, removeItem() {} };
	assert.deepEqual(loadHistory(broken, T0), EMPTY_HISTORY);
	assert.equal(saveHistory(broken, h), false);
});
