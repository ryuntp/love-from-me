import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, recordedEvent, T0, MINUTE, HOUR, DAY } from './support.mjs';
import { fmt } from '../app/assets/ui/format.js';
import { EMPTY_HISTORY, record } from '../app/assets/ui/telemetry.js';
import { incidentPack, expiredEvents, timeline, PACK_SCHEMA, APP_ID } from '../app/assets/ui/recordings.js';

test('the incident pack carries the telemetry from pre-roll before the start to the end, with stable key order', () => {
	let history = EMPTY_HISTORY;
	for (let s = -60; s <= 60; s += 5) history = record(history, snapshot({ at: T0 + s * 1000, v12: 12.9 }));
	const event = { id: 'c' + T0, trigger: 'motion', cameras: ['front', 'left'], startedAt: T0, endedAt: T0 + 30e3 };
	const text = incidentPack(event, history, 10);
	const pack = JSON.parse(text);
	assert.equal(pack.schema, PACK_SCHEMA);
	assert.equal(pack.app, APP_ID);
	assert.deepEqual(pack.event, event);
	assert.deepEqual(pack.telemetry.map((s) => (s.at - T0) / 1000), [-10, -5, 0, 5, 10, 15, 20, 25, 30]);
	assert.deepEqual(Object.keys(pack), ['app', 'event', 'schema', 'telemetry']);
	assert.deepEqual(Object.keys(pack.telemetry[0]), ['at', 'charge', 'hvV', 'locked', 'power', 'soc', 'tyres', 'v12', 'v12Low']);
	const reordered = { endedAt: event.endedAt, startedAt: event.startedAt, cameras: event.cameras, trigger: event.trigger, id: event.id };
	assert.equal(incidentPack(reordered, history, 10), text);
	assert.equal(JSON.parse(incidentPack(event, history, 0)).telemetry[0].at, T0);
	assert.deepEqual(JSON.parse(incidentPack(event, EMPTY_HISTORY, 10)).telemetry, []);
});

test('expired events are those whose end is older than the retention window', () => {
	const events = [
		recordedEvent({ id: 'c1', startedAt: T0 - 20 * MINUTE }),
		recordedEvent({ id: 'c2', startedAt: T0 - 26 * HOUR }),
		recordedEvent({ id: 'c3', startedAt: T0 - 5 * DAY }),
		recordedEvent({ id: 'c4', startedAt: T0 - 9 * DAY }),
	];
	assert.deepEqual(expiredEvents(events, 3, T0), ['c3', 'c4']);
	assert.deepEqual(expiredEvents(events, 7, T0), ['c4']);
	assert.deepEqual(expiredEvents(events, 14, T0), []);
	assert.deepEqual(expiredEvents([recordedEvent({ startedAt: T0 - 3 * DAY - 10e3, endedAt: T0 - 3 * DAY + 20e3 })], 3, T0), [], 'an event that ended inside the window stays');
	assert.deepEqual(expiredEvents([], 3, T0), []);
});

test('the timeline groups newest first by local day with fmt.day labels and honours the trigger filter', () => {
	const events = [
		recordedEvent({ id: 'old', startedAt: T0 - 5 * DAY, trigger: 'impact' }),
		recordedEvent({ id: 'today1', startedAt: T0 - 2 * HOUR }),
		recordedEvent({ id: 'yesterday', startedAt: T0 - 25 * HOUR, trigger: 'impact' }),
		recordedEvent({ id: 'today2', startedAt: T0 - 10 * MINUTE }),
	];
	const all = timeline(events, 'all', T0);
	assert.deepEqual(all.map((g) => g.label), ['Today', 'Yesterday', fmt.day(T0 - 5 * DAY, T0)]);
	assert.equal(all[2].label, 'Sun 4 Oct');
	assert.deepEqual(all.map((g) => g.events.map((e) => e.id)), [['today2', 'today1'], ['yesterday'], ['old']]);
	assert.deepEqual(timeline(events, 'impact', T0).map((g) => g.events.map((e) => e.id)), [['yesterday'], ['old']]);
	assert.deepEqual(timeline(events, 'motion', T0).map((g) => g.label), ['Today']);
	assert.deepEqual(timeline([], 'all', T0), []);
	assert.equal(events[0].id, 'old', 'the input is not reordered');
});
