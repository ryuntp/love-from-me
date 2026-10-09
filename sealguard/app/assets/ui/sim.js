// Deterministic host for the sandbox, the screenshots and the tests. It speaks the host's JSON over a Bridge, obeys every
// command, and moves only when advanceBy is called: replies and scheduled messages are delivered inside advanceBy, never
// inside send, so a page is populated synchronously after boot and a test controls every instant.
/** @typedef {{bridge: Bridge, clock: Clock, advanceBy: (ms: number) => void}} Sim */

const MINUTE = 60e3;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const START = new Date(2026, 9, 9, 21, 0).getTime();
const LAYOUT = ['front', 'rear', 'left', 'right'];
const CAMERA_LABEL = { front: 'Front', rear: 'Rear', left: 'Left', right: 'Right' };
const PARKED_EVERY_MS = 10e3;
const STATUS_EVERY_MS = 10e3;
const SURFACE_CHARGE_V = 0.3;
const SURFACE_DECAY_MS = 40 * MINUTE;
const WAKE_PROFILE = [0, 0.4, 0.9, 1.3];
const BATTERY_KWH = 82;
const COLD_KPA = { fl: 240, fr: 242, rl: 239, rr: 241 };

/**
 * Each scenario is a parked evening at 21:00 with its own past. parkedMin is how long the car has been parked at the start;
 * 0 means the evening drive ends as the scenario begins. v12 describes the 12V battery: resting volts on the night before
 * the scenario, how much higher each earlier night rested, resting volts tonight, slopes per hour parked, and the sag on wake.
 */
const SCENARIOS = {
	night: { pastDays: 7, parkedMin: 0, charging: false, leak: null, v12: { restPast: 12.92, decline: 0.02, restLive: 12.55, slopePast: -0.005, slopeLive: -0.35, sag: 0.9 },
		detections: [{ afterMs: 5 * MINUTE, trigger: 'motion', cameras: ['front'], score: 0.6 }] },
	prowler: { pastDays: 7, parkedMin: 0, charging: false, leak: null, v12: { restPast: 13.1, decline: 0, restLive: 13.1, slopePast: -0.004, slopeLive: -0.008, sag: 0.45 },
		detections: [{ afterMs: MINUTE, trigger: 'motion', cameras: ['front'], score: 0.7 }, { afterMs: 4 * MINUTE, trigger: 'motion', cameras: ['left', 'front'], score: 0.9 }, { afterMs: 8 * MINUTE, trigger: 'impact', cameras: ['rear'], score: 1 }] },
	leak: { pastDays: 21, parkedMin: 170, charging: false, leak: { wheel: 'rl', kpaPerDay: 1.0 }, v12: { restPast: 13.1, decline: 0, restLive: 13.1, slopePast: -0.004, slopeLive: -0.008, sag: 0.45 }, detections: [] },
	healthy: { pastDays: 14, parkedMin: 170, charging: false, leak: null, v12: { restPast: 13.1, decline: 0, restLive: 13.1, slopePast: -0.004, slopeLive: -0.008, sag: 0.45 }, detections: [] },
	charging: { pastDays: 7, parkedMin: 170, charging: { kw: 7.0, dc: false }, leak: null, v12: { restPast: 13.1, decline: 0, restLive: 13.1, slopePast: -0.004, slopeLive: -0.008, sag: 0.45 }, detections: [] },
};

function prng(seed) {
	let s = seed >>> 0;
	return function () {
		s = (s + 0x6D2B79F5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function stamp(at) {
	const d = new Date(at);
	return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}
function round(v, digits) { const f = Math.pow(10, digits); return Math.round(v * f) / f; }
function warm(kpa20, tempC) { return (kpa20 + 101.325) * ((273.15 + tempC) / 293.15) - 101.325; }

/** Four labelled quadrants and a time of day, as an image data URL, so no media load can ever fail in the sandbox. The stamp stays short so it clears the camera label the Cameras screen draws over the bottom left of each quadrant. */
function svgUrl(at, caption) {
	const fills = ['#15161c', '#1b1c23', '#1a1b21', '#131419'];
	const cells = LAYOUT.map(function (id, i) {
		const x = (i % 2) * 320;
		const y = i < 2 ? 0 : 180;
		return '<rect x="' + x + '" y="' + y + '" width="320" height="180" fill="' + fills[i] + '"/>' +
			'<text x="' + (x + 16) + '" y="' + (y + 36) + '" fill="#e6e6ec" font-family="sans-serif" font-size="24">' + CAMERA_LABEL[id] + '</text>';
	}).join('');
	const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">' + cells +
		'<path d="M320 0v360M0 180h640" stroke="#2c2c34" stroke-width="2"/>' +
		'<text x="624" y="344" text-anchor="end" fill="#9a9aa6" font-family="monospace" font-size="20">' + caption + ' ' + stamp(at) + '</text></svg>';
	return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

/** The car's day: two drives, a charge every other night in the past, and the scenario's own evening. */
function schedule(sc) {
	const drives = [];
	const charges = [];
	for (let d = sc.pastDays; d >= 0; d--) {
		const midnight = START - d * DAY - 21 * HOUR;
		drives.push([midnight + 8 * HOUR, midnight + 8 * HOUR + 40 * MINUTE]);
		if (d === 0 && sc.parkedMin === 0) drives.push([START - 40 * MINUTE, START]);
		else drives.push([midnight + 17 * HOUR + 30 * MINUTE, midnight + 18 * HOUR + 10 * MINUTE]);
		if (d > 0 && d % 2 === 0) charges.push([midnight + 22 * HOUR, midnight + 26 * HOUR]);
	}
	if (sc.charging) charges.push([START - sc.parkedMin * MINUTE + 5 * MINUTE, Infinity]);
	return { drives: drives, charges: charges };
}

/** The vehicle as a function of time, with the charge level integrated sample by sample. */
function createCar(sc, seed) {
	const random = prng(seed);
	const plan = schedule(sc);
	const noise = function (scale) { return (random() * 2 - 1) * scale; };
	let soc = 60;
	let socAt = null;
	const inside = function (list, t) { return list.filter(function (r) { return t >= r[0] && t < r[1]; })[0] || null; };
	const lastDriveBefore = function (t) {
		let last = null;
		plan.drives.forEach(function (r) { if (r[0] <= t && (last === null || r[0] > last[0])) last = r; });
		return last;
	};
	const rest = function (t) {
		return t >= START ? sc.v12.restLive : sc.v12.restPast + sc.v12.decline * (START - t) / DAY;
	};
	const cold = function (wheel, t) {
		const weather = 0.6 * Math.sin((t - START) / DAY / 5);
		if (sc.leak !== null && wheel === sc.leak.wheel) return COLD_KPA[wheel] + 13 - sc.leak.kpaPerDay * (sc.pastDays - (START - t) / DAY) + weather;
		return COLD_KPA[wheel] + weather;
	};
	return {
		sample: function (t) {
			const drive = inside(plan.drives, t);
			const driving = drive !== null;
			const charge = !driving ? inside(plan.charges, t) : null;
			const ratePerHour = driving ? -7.5 : charge !== null ? sc.charging && t >= START - sc.parkedMin * MINUTE ? 100 * sc.charging.kw / BATTERY_KWH : 100 * 8.5 / BATTERY_KWH : -0.3;
			if (socAt !== null) soc = Math.min(85, Math.max(12, soc + ratePerHour * (t - socAt) / HOUR));
			socAt = t;
			const last = lastDriveBefore(t);
			const parkStart = last === null ? t - DAY : driving ? last[0] : last[1];
			const sinceParkMs = t - parkStart;
			let v12;
			if (driving) {
				const step = Math.floor((t - drive[0]) / 1000);
				v12 = step < WAKE_PROFILE.length ? rest(t) - sc.v12.sag + WAKE_PROFILE[step] : 14.2 + noise(0.03);
			} else if (charge !== null) {
				v12 = 13.55 + noise(0.01);
			} else {
				const slope = t >= START ? sc.v12.slopeLive : sc.v12.slopePast;
				v12 = rest(t) + SURFACE_CHARGE_V * Math.exp(-sinceParkMs / SURFACE_DECAY_MS) + slope * sinceParkMs / HOUR + noise(0.004);
			}
			const hourOfDay = ((t - START + 21 * HOUR) % DAY) / HOUR;
			const ambient = 26 + 5 * Math.sin((hourOfDay - 9) / 24 * 2 * Math.PI);
			const heat = driving ? 10 * (1 - Math.exp(-(t - drive[0]) / (15 * MINUTE))) : last === null ? 0 : 10 * Math.exp(-sinceParkMs / SURFACE_DECAY_MS);
			const tempC = ambient + heat;
			const tyres = {};
			LAYOUT.forEach(function (unused, i) {
				const wheel = ['fl', 'fr', 'rl', 'rr'][i];
				tyres[wheel] = { kpa: round(warm(cold(wheel, t), tempC) + noise(0.5), 1), tempC: round(tempC + noise(0.3), 1) };
			});
			const chargeState = charge === null ? { state: 'unplugged' } : { state: 'charging', kw: round((sc.charging && t >= START - sc.parkedMin * MINUTE ? sc.charging.kw : 8.5) + noise(0.1), 1), dc: false };
			return {
				at: t, power: driving ? 'on' : 'off', locked: !driving, charge: chargeState, v12: round(v12, 3), v12Low: false,
				hvV: round(330 + soc * 0.8, 1), soc: round(soc, 1), tyres: tyres,
			};
		},
		/** Sample times for the past: hourly while parked, every twenty minutes while driving, dense for fifteen seconds after each wake. */
		pastTimes: function (until) {
			const first = START - sc.pastDays * DAY - 21 * HOUR + 6 * HOUR;
			const times = [];
			for (let t = first; t < until; t += 60 * MINUTE) times.push(t);
			plan.drives.forEach(function (r) {
				times.push(r[0] - 1000);
				for (let s = 0; s <= 15; s++) times.push(r[0] + s * 1000);
				for (let t = r[0] + 20 * MINUTE; t < r[1]; t += 20 * MINUTE) times.push(t);
				times.push(r[1]);
			});
			plan.charges.forEach(function (r) { times.push(r[0]); if (isFinite(r[1])) times.push(r[1]); });
			return times.filter(function (t) { return t >= first && t < until; }).sort(function (a, b) { return a - b; })
				.filter(function (t, i, all) { return i === 0 || t !== all[i - 1]; });
		},
	};
}

function pastEvents(count, random) {
	const events = [];
	for (let i = 0; i < count; i++) {
		const startedAt = Math.round(START - (i + 1) * (7 * DAY / (count + 1)) - random() * 3 * HOUR);
		const cameras = random() < 0.4 ? [LAYOUT[Math.floor(random() * 4)], LAYOUT[Math.floor(random() * 4)]].filter(function (c, k, all) { return all.indexOf(c) === k; }) : [LAYOUT[Math.floor(random() * 4)]];
		const trigger = i === 1 ? 'impact' : 'motion';
		events.push({ id: 'c' + startedAt, trigger: trigger, cameras: cameras, startedAt: startedAt, endedAt: startedAt + 20e3 + Math.round(random() * 60e3),
			clipUrl: svgUrl(startedAt, 'Clip'), thumbUrl: svgUrl(startedAt, 'Event'), layout: LAYOUT });
	}
	return events;
}

/** Deterministic host for the sandbox, the screenshots and the tests: night, prowler, leak, healthy and charging scenarios on virtual time with seeded noise. It replies on its own clock, never inside send; it backfills past days sparsely and densely only around power changes so a world is populated within the screenshot runner's 300 ms wait; its media are SVG data URLs so no load ever fails. @param {'night'|'prowler'|'leak'|'healthy'|'charging'} scenario @param {number} seed @param {'dark'|'light'} theme @returns {Sim} */
export function createSimulator(scenario, seed, theme) {
	const sc = Object.prototype.hasOwnProperty.call(SCENARIOS, scenario) ? SCENARIOS[scenario] : SCENARIOS.night;
	const random = prng(seed * 7919 + 17);
	const car = createCar(sc, seed);
	let now = START;
	let listener = null;
	const inbox = [];
	const timers = [];
	const host = { killed: false, autostart: 'allowed', watch: null, recording: null, lapse: null };
	let events = pastEvents(4 + Math.floor(random() * 5), random);
	const detections = sc.detections.map(function (d) { return Object.assign({ at: START + d.afterMs }, d); });
	let nextVehicleAt = START + PARKED_EVERY_MS;
	let nextStatusAt = START + STATUS_EVERY_MS;

	// A reply is built when it is delivered, so a status never echoes a state older than the command before it.
	function reply(build) { inbox.push({ at: now, build: build }); }
	function vehicle(t) { return function () { return Object.assign({ t: 'vehicle' }, car.sample(t)); }; }
	function status() {
		const parked = car.sample(now).power === 'off';
		return {
			t: 'status', version: 'sim 0.1', killed: host.killed, theme: theme, autostart: host.autostart,
			watch: host.watch, recording: host.recording, lapse: host.lapse,
			cameras: host.killed ? [] : LAYOUT.map(function (id) { return { id: id, fps: 15 }; }),
			mosaic: parked && !host.killed ? { url: svgUrl(now, 'Live'), layout: LAYOUT } : null,
			selfTest: [
				{ name: 'Surround cameras', ok: !host.killed, detail: host.killed ? 'Off while the kill switch is on' : 'Four streams at 15 fps' },
				{ name: 'Vehicle data', ok: true, detail: 'Updating every 10 s while parked' },
				{ name: 'Storage', ok: true, detail: '12 GB free for recordings' },
			],
		};
	}
	function eventsIndex() { return { t: 'events', events: events }; }
	function recorded(core) {
		return { id: core.id, trigger: core.trigger, cameras: core.cameras, startedAt: core.startedAt, endedAt: core.endedAt, clipUrl: svgUrl(core.startedAt, 'Clip'), thumbUrl: svgUrl(core.startedAt, 'Event'), layout: LAYOUT };
	}

	const COMMANDS = {
		hello: function () {
			car.pastTimes(now).forEach(function (t) { reply(vehicle(t)); });
			reply(vehicle(now));
			reply(status);
			reply(eventsIndex);
		},
		startWatch: function (c) { host.watch = { session: c.session, since: c.since }; reply(status); },
		stopWatch: function (c) { if (host.watch !== null && host.watch.session === c.session) host.watch = null; reply(status); },
		startRecording: function (c) { host.recording = c.clip; reply(status); },
		stopRecording: function (c) { if (host.recording !== null && host.recording.id === c.id) host.recording = null; reply(status); },
		saveEvent: function (c) {
			if (!events.some(function (e) { return e.id === c.event.id; })) events = events.concat([recorded(c.event)]);
			reply(eventsIndex);
		},
		deleteEvents: function (c) { events = events.filter(function (e) { return c.ids.indexOf(e.id) === -1; }); reply(eventsIndex); },
		startLapse: function (c) { host.lapse = { session: c.session, intervalS: c.intervalS }; reply(status); },
		stopLapse: function (c) { if (host.lapse !== null && host.lapse.session === c.session) host.lapse = null; reply(status); },
		setKill: function (c) {
			host.killed = c.on;
			if (c.on) { host.watch = null; host.recording = null; host.lapse = null; }
			reply(status);
		},
		exportEvent: function (c) {
			const ok = events.some(function (e) { return e.id === c.id; });
			reply(function () { return { t: 'exported', id: c.id, ok: ok, where: 'SealGuard/' + c.id + '.zip' }; });
		},
		openAutostart: function () { host.autostart = 'allowed'; reply(status); },
	};

	function onCommand(text) {
		let c = null;
		try { c = JSON.parse(text); } catch (e) { return; }
		if (c === null || typeof c !== 'object' || c.v !== 1 || typeof c.t !== 'string' || !Object.prototype.hasOwnProperty.call(COMMANDS, c.t)) return;
		COMMANDS[c.t](c);
	}

	function deliver() {
		const item = inbox.shift();
		if (listener !== null) listener(JSON.stringify(Object.assign({ v: 1 }, item.build())));
	}
	function emitVehicle() {
		nextVehicleAt += PARKED_EVERY_MS;
		reply(vehicle(now));
	}
	function emitStatus() {
		nextStatusAt += STATUS_EVERY_MS;
		reply(status);
	}
	function emitDetection() {
		const d = detections.shift();
		const at = now;
		// The surround cameras run only while the host is watching, so an idle sentry sees no detections.
		if (host.watch !== null && !host.killed) reply(function () { return { t: 'detection', at: at, trigger: d.trigger, cameras: d.cameras, score: d.score }; });
	}

	function advanceBy(ms) {
		const end = now + ms;
		for (;;) {
			let at = Infinity;
			let fire = null;
			if (inbox.length && inbox[0].at < at) { at = inbox[0].at; fire = deliver; }
			if (nextVehicleAt < at) { at = nextVehicleAt; fire = emitVehicle; }
			if (detections.length && detections[0].at < at) { at = detections[0].at; fire = emitDetection; }
			if (nextStatusAt < at) { at = nextStatusAt; fire = emitStatus; }
			timers.forEach(function (timer) {
				if (timer.next < at) { at = timer.next; fire = function () { timer.next += timer.ms; timer.fn(); }; }
			});
			if (at > end) break;
			now = Math.max(now, at);
			fire();
		}
		now = end;
	}

	return {
		bridge: {
			send: onCommand,
			// A new listener is a reloaded page, whose timers died with the old one.
			listen: function (fn) { listener = fn; timers.length = 0; },
		},
		clock: {
			now: function () { return now; },
			every: function (ms, fn) { timers.push({ ms: ms, next: now + ms, fn: fn }); },
		},
		advanceBy: advanceBy,
	};
}
