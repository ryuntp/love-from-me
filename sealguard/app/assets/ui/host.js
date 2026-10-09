// The boundary: the only module that reads bridge text or writes command text. Parsing is total, so a bad message
// becomes a rejected input that the hub counts instead of an exception that stops the page.
/** @typedef {'front'|'rear'|'left'|'right'} CameraId */
/** @typedef {'motion'|'impact'} Trigger */
/** @typedef {string} SessionId  'p' + the at of the power-off sample that began the park, so a reload derives the same id */
/** @typedef {string} ClipId  'c' + startedAt; the saved event keeps it as its EventId */
/** @typedef {ClipId} EventId */
/** @typedef {{id: ClipId, trigger: Trigger, cameras: CameraId[], startedAt: Millis, lastSeenAt: Millis}} Clip */
/** @typedef {{url: string, layout: CameraId[]}} Mosaic  one composite stream or file; layout names the quadrants in reading order */
/** @typedef {{version: string, killed: boolean, theme: 'dark'|'light', autostart: 'allowed'|'blocked'|'unknown', watch: {session: SessionId, since: Millis}|null, recording: Clip|null,
 *   lapse: {session: SessionId, intervalS: number}|null, cameras: {id: CameraId, fps: number}[], mosaic: Mosaic|null, selfTest: {name: string, ok: boolean, detail: string}[]}} HostStatus
 * watch, recording and lapse echo the last commands the host obeyed, which is what lets a reload adopt them. */
/**
 * @typedef {{kind: 'vehicle', snapshot: VehicleSnapshot}
 *   | {kind: 'detection', at: Millis, trigger: Trigger, cameras: CameraId[], score: number}
 *   | {kind: 'status', status: HostStatus}
 *   | {kind: 'events', events: RecordedEvent[]}
 *   | {kind: 'exported', id: EventId, ok: boolean, where: string}
 *   | {kind: 'rejected', reason: string}} HostInput
 */
/**
 * @typedef {{kind: 'hello'}
 *   | {kind: 'startWatch', session: SessionId, since: Millis, deterrent: boolean} | {kind: 'stopWatch', session: SessionId}
 *   | {kind: 'startRecording', clip: Clip, preRollS: number} | {kind: 'stopRecording', id: ClipId}
 *   | {kind: 'saveEvent', event: EventCore, pack: string} | {kind: 'deleteEvents', ids: EventId[]}
 *   | {kind: 'startLapse', session: SessionId, intervalS: number} | {kind: 'stopLapse', session: SessionId}
 *   | {kind: 'exportEvent', id: EventId} | {kind: 'setKill', on: boolean} | {kind: 'openAutostart'}} Command
 * Every command names what it acts on so the host treats a repeat as a no-op. startLapse for a running
 * session only changes the interval, which is what keeps one time-lapse clip per park.
 */
/** @typedef {{send: (text: string) => void, listen: (fn: (text: string) => void) => void}} Bridge */
/** @typedef {{now: () => Millis, every: (ms: number, fn: () => void) => void}} Clock */

const VERSION = 1;
const CAMERAS = ['front', 'rear', 'left', 'right'];
const TRIGGERS = ['motion', 'impact'];
const POWERS = ['off', 'acc', 'on'];
const WHEELS = ['fl', 'fr', 'rl', 'rr'];
const CHARGE_STATES = ['unplugged', 'plugged', 'charging'];
const THEMES = ['dark', 'light'];
const AUTOSTART = ['allowed', 'blocked', 'unknown'];
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost'];

function Rejection(reason) { this.reason = reason; }
function fail(path, what) { throw new Rejection(path + ' ' + what); }
function has(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }

function obj(v, path) { if (v === null || typeof v !== 'object' || Array.isArray(v)) fail(path, 'must be an object'); return v; }
function num(v, path, min, max) { if (typeof v !== 'number' || !isFinite(v) || v < min || v > max) fail(path, 'must be a number from ' + min + ' to ' + max); return v; }
function millis(v, path) { return num(v, path, 0, 1e14); }
function bool(v, path) { if (typeof v !== 'boolean') fail(path, 'must be true or false'); return v; }
function str(v, path) { if (typeof v !== 'string' || v === '') fail(path, 'must be text'); return v; }
function text(v) { return typeof v === 'string' ? v : ''; }
function oneOf(v, path, options) { if (options.indexOf(v) === -1) fail(path, 'must be one of ' + options.join(', ')); return v; }
function list(v, path, item) {
	if (!Array.isArray(v)) fail(path, 'must be a list');
	return v.map(function (x, i) { return item(x, path + '[' + i + ']'); });
}
function nullable(v, path, parse) { return v === null || v === undefined ? null : parse(v, path); }
/** Media may come only from inline image or video data, the host's own files, a blob, or a plain http loopback stream, judged on the parsed URL so no userinfo or host suffix can point an img at the network. */
function allowedUrl(text) {
	let u = null;
	try { u = new URL(text); } catch (e) { return false; }
	if (u.protocol === 'data:') return /^(image|video)\//.test(u.pathname);
	if (u.protocol === 'blob:' || u.protocol === 'file:') return true;
	return u.protocol === 'http:' && LOOPBACK_HOSTS.indexOf(u.hostname) >= 0 && u.username === '' && u.password === '';
}
function url(v, path) { if (!allowedUrl(str(v, path))) fail(path, 'must be a data, file, blob or loopback url'); return v; }
/** Rejects a list whose items repeat a key, naming the repeat and the item it repeats. */
function unique(items, path, field, keyOf) {
	const seen = new Map();
	items.forEach(function (item, i) {
		const key = keyOf(item);
		if (seen.has(key)) fail(path + '[' + i + '].' + field, 'must not repeat ' + path + '[' + seen.get(key) + ']');
		seen.set(key, i);
	});
	return items;
}
function cameras(v, path) {
	const ids = list(v, path, function (x, p) { return oneOf(x, p, CAMERAS); });
	if (ids.length === 0) fail(path, 'must name a camera');
	return ids;
}

function charge(v, path) {
	const c = obj(v, path);
	const state = oneOf(c.state, path + '.state', CHARGE_STATES);
	if (state !== 'charging') return { state: state };
	return { state: state, kw: num(c.kw, path + '.kw', 0, 1000), dc: bool(c.dc, path + '.dc') };
}
function tyres(v, path) {
	const t = obj(v, path);
	const out = {};
	WHEELS.forEach(function (w) {
		const r = obj(t[w], path + '.' + w);
		out[w] = { kpa: num(r.kpa, path + '.' + w + '.kpa', 0, 1000), tempC: num(r.tempC, path + '.' + w + '.tempC', -60, 150) };
	});
	return out;
}
function snapshot(m) {
	return {
		at: millis(m.at, 'at'), power: oneOf(m.power, 'power', POWERS), locked: bool(m.locked, 'locked'), charge: charge(m.charge, 'charge'),
		v12: num(m.v12, 'v12', 0, 20), v12Low: bool(m.v12Low, 'v12Low'), hvV: num(m.hvV, 'hvV', 0, 1000), soc: num(m.soc, 'soc', 0, 100),
		tyres: nullable(m.tyres, 'tyres', tyres),
	};
}
function clip(v, path) {
	const c = obj(v, path);
	return {
		id: str(c.id, path + '.id'), trigger: oneOf(c.trigger, path + '.trigger', TRIGGERS), cameras: cameras(c.cameras, path + '.cameras'),
		startedAt: millis(c.startedAt, path + '.startedAt'), lastSeenAt: millis(c.lastSeenAt, path + '.lastSeenAt'),
	};
}
function mosaic(v, path) {
	const m = obj(v, path);
	return { url: url(m.url, path + '.url'), layout: cameras(m.layout, path + '.layout') };
}
function watch(v, path) {
	const w = obj(v, path);
	return { session: str(w.session, path + '.session'), since: millis(w.since, path + '.since') };
}
function lapse(v, path) {
	const l = obj(v, path);
	return { session: str(l.session, path + '.session'), intervalS: num(l.intervalS, path + '.intervalS', 1, 3600) };
}
function camera(v, path) {
	const c = obj(v, path);
	return { id: oneOf(c.id, path + '.id', CAMERAS), fps: num(c.fps, path + '.fps', 0, 240) };
}
function selfTest(v, path) {
	const t = obj(v, path);
	return { name: str(t.name, path + '.name'), ok: bool(t.ok, path + '.ok'), detail: text(t.detail) };
}
function status(m) {
	return {
		version: str(m.version, 'version'), killed: bool(m.killed, 'killed'), theme: oneOf(m.theme, 'theme', THEMES), autostart: oneOf(m.autostart, 'autostart', AUTOSTART),
		watch: nullable(m.watch, 'watch', watch), recording: nullable(m.recording, 'recording', clip), lapse: nullable(m.lapse, 'lapse', lapse),
		cameras: unique(list(m.cameras === undefined ? [] : m.cameras, 'cameras', camera), 'cameras', 'id', function (c) { return c.id; }),
		mosaic: nullable(m.mosaic, 'mosaic', mosaic),
		selfTest: unique(list(m.selfTest === undefined ? [] : m.selfTest, 'selfTest', selfTest), 'selfTest', 'name', function (t) { return t.name; }),
	};
}
function event(v, path) {
	const e = obj(v, path);
	const startedAt = millis(e.startedAt, path + '.startedAt');
	const endedAt = millis(e.endedAt, path + '.endedAt');
	if (endedAt < startedAt) fail(path + '.endedAt', 'must not precede startedAt');
	return {
		id: str(e.id, path + '.id'), trigger: oneOf(e.trigger, path + '.trigger', TRIGGERS), cameras: cameras(e.cameras, path + '.cameras'), startedAt: startedAt, endedAt: endedAt,
		clipUrl: url(e.clipUrl, path + '.clipUrl'), thumbUrl: url(e.thumbUrl, path + '.thumbUrl'), layout: cameras(e.layout, path + '.layout'),
	};
}

const MESSAGES = {
	vehicle: function (m) { return { kind: 'vehicle', snapshot: snapshot(m) }; },
	detection: function (m) { return { kind: 'detection', at: millis(m.at, 'at'), trigger: oneOf(m.trigger, 'trigger', TRIGGERS), cameras: cameras(m.cameras, 'cameras'), score: num(m.score, 'score', 0, 1) }; },
	status: function (m) { return { kind: 'status', status: status(m) }; },
	events: function (m) { return { kind: 'events', events: unique(list(m.events, 'events', event), 'events', 'id', function (e) { return e.id; }) }; },
	exported: function (m) { return { kind: 'exported', id: str(m.id, 'id'), ok: bool(m.ok, 'ok'), where: text(m.where) }; },
};

/** Total: any text becomes a HostInput, with rejected naming the first field that failed. @param {string} text @returns {HostInput} */
export function parseMessage(text) {
	try {
		const m = obj(JSON.parse(text), 'message');
		if (m.v !== VERSION) fail('v', 'must be ' + VERSION);
		if (typeof m.t !== 'string' || !has(MESSAGES, m.t)) fail('t', 'must name a message type');
		return MESSAGES[m.t](m);
	} catch (e) {
		return { kind: 'rejected', reason: e instanceof Rejection ? e.reason : 'unreadable: ' + String(e && e.message ? e.message : e) };
	}
}

/** The wire form of a command: the domain fields under v and t. @param {Command} command @returns {string} */
export function encodeCommand(command) {
	const { kind, ...fields } = command;
	return JSON.stringify(Object.assign({ v: VERSION, t: kind }, fields));
}

/** Adapts window.SealGuardHost.post and window.sealguardReceive to a Bridge. @param {Window} win @returns {Bridge} */
export function nativeBridge(win) {
	return {
		send: function (text) { win.SealGuardHost.post(text); },
		listen: function (fn) { win.sealguardReceive = fn; },
	};
}

/** Parses each bridge text exactly once into a HostInput for onInput and returns the command sender; parsing never throws. @param {Bridge} bridge @param {(input: HostInput) => void} onInput @returns {(command: Command) => void} */
export function connectHost(bridge, onInput) {
	bridge.listen(function (text) { onInput(parseMessage(text)); });
	return function (command) { bridge.send(encodeCommand(command)); };
}
