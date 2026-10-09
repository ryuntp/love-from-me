// Shared test doubles. Not matched by the *.test.mjs glob.
process.env.TZ = 'Asia/Bangkok';

import { parseConfig } from '../app/assets/ui/config.js';

/** In-memory Storage. refuseWrites makes setItem throw, the way a full or disabled localStorage does. */
export function memoryStorage(seed) {
	const map = new Map(Object.entries(seed || {}));
	const storage = {
		refuseWrites: false,
		getItem(k) { return map.has(k) ? map.get(k) : null; },
		setItem(k, v) { if (storage.refuseWrites) throw new Error('QuotaExceededError'); map.set(k, String(v)); },
		removeItem(k) { map.delete(k); },
		key(i) { return Array.from(map.keys())[i] === undefined ? null : Array.from(map.keys())[i]; },
		get length() { return map.size; },
		dump() { return Object.fromEntries(map); },
	};
	return storage;
}

/** A bridge whose other end is the test: sent collects command text, deliver hands text to the listener. */
export function fakeBridge() {
	let listener = null;
	const bridge = {
		sent: [],
		send(text) { bridge.sent.push(text); },
		listen(fn) { listener = fn; },
		deliver(text) { listener(text); },
		json() { return bridge.sent.map((t) => JSON.parse(t)); },
	};
	return bridge;
}

/** A clock the test moves by hand; every registers repeating callbacks that advance fires in time order. */
export function fixedClock(start) {
	let now = start;
	const timers = [];
	return {
		now() { return now; },
		every(ms, fn) { timers.push({ ms, next: now + ms, fn }); },
		advance(ms) {
			const end = now + ms;
			for (;;) {
				let due = null;
				timers.forEach((t) => { if (t.next <= end && (due === null || t.next < due.next)) due = t; });
				if (due === null) break;
				now = due.next;
				due.next += due.ms;
				due.fn();
			}
			now = end;
		},
	};
}

export const MINUTE = 60e3;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
/** 2026-10-09 21:00 in Asia/Bangkok, the evening every scenario starts on. */
export const T0 = new Date(2026, 9, 9, 21, 0).getTime();
export const defaults = parseConfig(null);

export function tyreSet(kpa, tempC) {
	return { fl: { kpa, tempC }, fr: { kpa, tempC }, rl: { kpa, tempC }, rr: { kpa, tempC } };
}

/** A parked, locked, healthy snapshot at T0 unless overridden. */
export function snapshot(over) {
	return Object.assign({
		at: T0, power: 'off', locked: true, charge: { state: 'unplugged' }, v12: 13.0, v12Low: false, hvV: 390, soc: 70, tyres: tyreSet(240, 25),
	}, over || {});
}

export function parkOf(at) { return { id: 'p' + at, at }; }

/** Sentry state builders; reading defaults to a snapshot at the park's start. */
export function idleState(over) {
	const at = (over && over.park && over.park.at) || T0;
	return Object.assign({ mode: 'idle', park: parkOf(at), reading: snapshot({ at }), lowSince: null, lastClipAt: null, disarmed: false }, over || {});
}
export function armedState(over) {
	const at = (over && over.park && over.park.at) || T0;
	return Object.assign({ mode: 'armed', park: parkOf(at), reading: snapshot({ at }), lowSince: null, lastClipAt: null, armedAt: at, deterrent: false }, over || {});
}
export function recordingState(over) {
	const at = (over && over.park && over.park.at) || T0;
	const startedAt = (over && over.clip && over.clip.startedAt) || at + MINUTE;
	const clip = Object.assign({ id: 'c' + startedAt, trigger: 'motion', cameras: ['front'], startedAt, lastSeenAt: startedAt }, (over && over.clip) || {});
	return Object.assign({ mode: 'recording', park: parkOf(at), reading: snapshot({ at }), lowSince: null, lastClipAt: null, armedAt: at, deterrent: false, clip }, over || {}, { clip });
}
/** A halt on the 12V under the default floors; the reading defaults to 12.3 V at the park's start. */
export function haltedState(over) {
	const at = (over && over.park && over.park.at) || T0;
	return Object.assign({ mode: 'halted', park: parkOf(at), reading: snapshot({ at, v12: 12.3 }), lowSince: null, lastClipAt: null, reason: 'v12', value: 12.3, at, floors: { v12: 12.4, soc: 20 } }, over || {});
}

export function hostStatus(over) {
	return Object.assign({
		version: 'test', killed: false, theme: 'dark', autostart: 'allowed', watch: null, recording: null, lapse: null,
		cameras: [{ id: 'front', fps: 15 }, { id: 'rear', fps: 15 }, { id: 'left', fps: 15 }, { id: 'right', fps: 15 }],
		mosaic: { url: 'data:image/svg+xml;utf8,<svg/>', layout: ['front', 'rear', 'left', 'right'] }, selfTest: [],
	}, over || {});
}

export function recordedEvent(over) {
	const startedAt = (over && over.startedAt) || T0 - HOUR;
	return Object.assign({
		id: 'c' + startedAt, trigger: 'motion', cameras: ['front'], startedAt, endedAt: startedAt + 30e3,
		clipUrl: 'data:video/mp4;base64,AAAA', thumbUrl: 'data:image/svg+xml;utf8,<svg/>', layout: ['front', 'rear', 'left', 'right'],
	}, over || {});
}

/** Small deterministic PRNG for property tests. */
export function prng(seed) {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6D2B79F5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
