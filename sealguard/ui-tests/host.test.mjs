import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeBridge, snapshot, hostStatus, recordedEvent, T0 } from './support.mjs';
import { parseMessage, encodeCommand, connectHost, nativeBridge } from '../app/assets/ui/host.js';

function wire(t, fields) { return JSON.stringify(Object.assign({ v: 1, t }, fields)); }

test('every message kind parses into its HostInput', () => {
	const snap = snapshot();
	assert.deepEqual(parseMessage(wire('vehicle', snap)), { kind: 'vehicle', snapshot: snap });
	const sleeping = snapshot({ tyres: null, charge: { state: 'charging', kw: 7.2, dc: false } });
	assert.deepEqual(parseMessage(wire('vehicle', sleeping)).snapshot, sleeping);
	assert.deepEqual(parseMessage(wire('detection', { at: T0, trigger: 'motion', cameras: ['front', 'left'], score: 0.62 })),
		{ kind: 'detection', at: T0, trigger: 'motion', cameras: ['front', 'left'], score: 0.62 });
	const status = hostStatus({ watch: { session: 'p1', since: T0 }, recording: { id: 'c2', trigger: 'impact', cameras: ['rear'], startedAt: T0, lastSeenAt: T0 + 5e3 }, lapse: { session: 'p1', intervalS: 30 },
		selfTest: [{ name: 'Storage', ok: true, detail: '12 GB free' }] });
	assert.deepEqual(parseMessage(wire('status', status)), { kind: 'status', status });
	const ev = recordedEvent();
	assert.deepEqual(parseMessage(wire('events', { events: [ev] })), { kind: 'events', events: [ev] });
	assert.deepEqual(parseMessage(wire('exported', { id: 'c1', ok: true, where: 'SealGuard/c1.zip' })), { kind: 'exported', id: 'c1', ok: true, where: 'SealGuard/c1.zip' });
});

test('optional lists and strings default rather than reject', () => {
	const bare = hostStatus();
	delete bare.cameras;
	delete bare.selfTest;
	const parsed = parseMessage(wire('status', bare)).status;
	assert.deepEqual(parsed.cameras, []);
	assert.deepEqual(parsed.selfTest, []);
	assert.equal(parseMessage(wire('exported', { id: 'c1', ok: false })).where, '');
	assert.equal(parseMessage(wire('status', hostStatus({ selfTest: [{ name: 'Link', ok: true }] }))).status.selfTest[0].detail, '');
});

test('malformed, wrong-version, unknown and out-of-range input becomes rejected with the field named', () => {
	const cases = [
		['{not json', /unreadable/],
		['"text"', /message must be an object/],
		['[]', /message must be an object/],
		['null', /message must be an object/],
		[JSON.stringify({ v: 2, t: 'vehicle' }), /^v must be 1$/],
		[JSON.stringify({ v: 1, t: 'dance' }), /^t must name a message type$/],
		[JSON.stringify({ v: 1, t: 'constructor' }), /^t must name a message type$/],
		[JSON.stringify({ v: 1 }), /^t must name a message type$/],
		[wire('vehicle', snapshot({ v12: 25 })), /^v12 must be a number from 0 to 20$/],
		[wire('vehicle', snapshot({ soc: 101 })), /^soc must be/],
		[wire('vehicle', snapshot({ power: 'sleep' })), /^power must be one of off, acc, on$/],
		[wire('vehicle', snapshot({ locked: 'yes' })), /^locked must be true or false$/],
		[wire('vehicle', snapshot({ at: -1 })), /^at must be/],
		[wire('vehicle', snapshot({ at: '2026' })), /^at must be/],
		[wire('vehicle', snapshot({ charge: { state: 'charging', kw: 7 } })), /^charge.dc must be/],
		[wire('vehicle', snapshot({ tyres: { fl: { kpa: 240, tempC: 20 } } })), /^tyres.fr must be an object$/],
		[wire('vehicle', snapshot({ tyres: { fl: { kpa: 2400, tempC: 20 }, fr: {}, rl: {}, rr: {} } })), /^tyres.fl.kpa must be/],
		[wire('detection', { at: T0, trigger: 'motion', cameras: ['front'], score: 1.2 }), /^score must be a number from 0 to 1$/],
		[wire('detection', { at: T0, trigger: 'motion', cameras: [], score: 0.5 }), /^cameras must name a camera$/],
		[wire('detection', { at: T0, trigger: 'motion', cameras: ['roof'], score: 0.5 }), /^cameras\[0\] must be one of/],
		[wire('detection', { at: T0, trigger: 'noise', cameras: ['front'], score: 0.5 }), /^trigger must be one of/],
		[wire('status', hostStatus({ theme: 'sepia' })), /^theme must be one of dark, light$/],
		[wire('status', hostStatus({ killed: 1 })), /^killed must be/],
		[wire('status', hostStatus({ mosaic: { url: 'http://evil.example/cam', layout: ['front'] } })), /^mosaic.url must be a data, file, blob or loopback url$/],
		[wire('status', hostStatus({ mosaic: { url: 'javascript:alert(1)', layout: ['front'] } })), /^mosaic.url must be/],
		[wire('status', hostStatus({ lapse: { session: 'p1', intervalS: 0 } })), /^lapse.intervalS must be/],
		[wire('status', hostStatus({ cameras: [{ id: 'front', fps: 'fast' }] })), /^cameras\[0\].fps must be/],
		[wire('events', { events: [recordedEvent({ clipUrl: 'https://cdn.example/clip.mp4' })] }), /^events\[0\].clipUrl must be/],
		[wire('events', { events: [recordedEvent({ endedAt: T0 - 2 * 3600e3 })] }), /^events\[0\].endedAt must not precede startedAt$/],
		[wire('events', { events: { id: 'c1' } }), /^events must be a list$/],
		[wire('exported', { id: '', ok: true, where: '' }), /^id must be text$/],
	];
	cases.forEach(([text, reason]) => {
		const input = parseMessage(text);
		assert.equal(input.kind, 'rejected', text);
		assert.match(input.reason, reason, text);
	});
});

test('the parser never throws, whatever it is handed', () => {
	[undefined, null, 42, {}, '', 'undefined', '{"v":1,"t":"vehicle"}', '{"v":1,"t":"status"}', '{"v":1,"t":"events"}', '{"v":1,"t":"__proto__"}'].forEach((text) => {
		const input = parseMessage(text);
		assert.equal(input.kind, 'rejected', String(text));
		assert.equal(typeof input.reason, 'string');
	});
});

test('loopback and local media pass the url check', () => {
	['data:image/svg+xml;utf8,<svg/>', 'data:video/mp4;base64,AAAA', 'file:///sdcard/clip.mp4', 'blob:null/abc', 'http://127.0.0.1:8080/live', 'http://localhost/live'].forEach((u) => {
		assert.equal(parseMessage(wire('status', hostStatus({ mosaic: { url: u, layout: ['front'] } }))).kind, 'status', u);
	});
	['data:text/html,<b>x</b>', 'http://127.0.0.1.evil.example/', 'ftp://127.0.0.1/x', 'localhost/live'].forEach((u) => {
		assert.equal(parseMessage(wire('status', hostStatus({ mosaic: { url: u, layout: ['front'] } }))).kind, 'rejected', u);
	});
});

test('every command encodes to v 1 with its kind as t and its fields alongside', () => {
	const clip = { id: 'c' + T0, trigger: 'motion', cameras: ['front'], startedAt: T0, lastSeenAt: T0 };
	const event = { id: clip.id, trigger: 'motion', cameras: ['front'], startedAt: T0, endedAt: T0 + 20e3 };
	const commands = [
		{ kind: 'hello' },
		{ kind: 'startWatch', session: 'p1', since: T0, deterrent: false },
		{ kind: 'stopWatch', session: 'p1' },
		{ kind: 'startRecording', clip, preRollS: 10 },
		{ kind: 'stopRecording', clip: clip.id },
		{ kind: 'saveEvent', event, pack: '{"schema":"sealguard.incident/1"}' },
		{ kind: 'deleteEvents', ids: ['c1', 'c2'] },
		{ kind: 'startLapse', session: 'p1', intervalS: 30 },
		{ kind: 'stopLapse', session: 'p1' },
		{ kind: 'exportEvent', id: 'c1' },
		{ kind: 'setKill', on: true },
		{ kind: 'openAutostart' },
	];
	commands.forEach((command) => {
		const wireForm = JSON.parse(encodeCommand(command));
		assert.equal(wireForm.v, 1, command.kind);
		assert.equal(wireForm.t, command.kind);
		assert.equal('kind' in wireForm, false);
		const { kind, ...fields } = command;
		Object.keys(fields).forEach((k) => assert.deepEqual(wireForm[k], fields[k], command.kind + '.' + k));
	});
});

test('connectHost parses what the bridge delivers and encodes what the sender is given', () => {
	const bridge = fakeBridge();
	const inputs = [];
	const send = connectHost(bridge, (input) => inputs.push(input));
	bridge.deliver(wire('detection', { at: T0, trigger: 'impact', cameras: ['rear'], score: 1 }));
	bridge.deliver('garbage');
	assert.equal(inputs[0].kind, 'detection');
	assert.equal(inputs[1].kind, 'rejected');
	send({ kind: 'hello' });
	send({ kind: 'setKill', on: false });
	assert.deepEqual(bridge.json(), [{ v: 1, t: 'hello' }, { v: 1, t: 'setKill', on: false }]);
});

test('nativeBridge posts through SealGuardHost and installs sealguardReceive, touching the window only when called', () => {
	const posted = [];
	const win = { SealGuardHost: { post(text) { posted.push(text); } } };
	const bridge = nativeBridge(win);
	assert.equal('sealguardReceive' in win, false);
	const heard = [];
	bridge.listen((text) => heard.push(text));
	win.sealguardReceive('{"v":1,"t":"hello"}');
	bridge.send('{"v":1,"t":"hello"}');
	assert.deepEqual(heard, ['{"v":1,"t":"hello"}']);
	assert.deepEqual(posted, ['{"v":1,"t":"hello"}']);
});
