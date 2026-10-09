// Recorded events: the incident pack sealed when a clip closes, retention, and the day-grouped timeline.
import { fmt } from './format.js';
import { since } from './telemetry.js';

/** @typedef {{id: EventId, trigger: Trigger, cameras: CameraId[], startedAt: Millis, endedAt: Millis}} EventCore */
/** @typedef {EventCore & {clipUrl: string, thumbUrl: string, layout: CameraId[]}} RecordedEvent */
/** @typedef {{schema: 'sealguard.incident/1', event: EventCore, telemetry: VehicleSnapshot[], app: string}} IncidentPack */
/** @typedef {{label: string, events: RecordedEvent[]}} DayGroup */

const DAY = 24 * 3600e3;
export const PACK_SCHEMA = 'sealguard.incident/1';
export const APP_ID = 'sealguard-ui';

/** The same value with every object's keys in sorted order, so two packs of the same facts are the same text. */
function stable(value) {
	if (Array.isArray(value)) return value.map(stable);
	if (value === null || typeof value !== 'object') return value;
	const out = {};
	Object.keys(value).sort().forEach(function (k) { out[k] = stable(value[k]); });
	return out;
}

/** Serializes a closing clip with the telemetry from pre-roll before its start to its end; called at close because only then is that window certain to be in memory. @param {EventCore} event @param {History} history @param {number} preRollS @returns {string} */
export function incidentPack(event, history, preRollS) {
	const telemetry = since(history, event.startedAt - preRollS * 1000).filter(function (s) { return s.at <= event.endedAt; });
	return JSON.stringify(stable({ schema: PACK_SCHEMA, event: event, telemetry: telemetry, app: APP_ID }));
}

/** Ids of events whose end is older than the retention window. @param {RecordedEvent[]} events @param {number} retentionDays @param {Millis} now @returns {EventId[]} */
export function expiredEvents(events, retentionDays, now) {
	const horizon = now - retentionDays * DAY;
	return events.filter(function (e) { return e.endedAt < horizon; }).map(function (e) { return e.id; });
}

/** Newest-first local-day groups filtered by trigger and labelled Today, Yesterday or a date. @param {RecordedEvent[]} events @param {Trigger|'all'} filter @param {Millis} now @returns {DayGroup[]} */
export function timeline(events, filter, now) {
	const shown = events.filter(function (e) { return filter === 'all' || e.trigger === filter; }).sort(function (a, b) { return b.startedAt - a.startedAt; });
	const groups = [];
	shown.forEach(function (e) {
		const label = fmt.day(e.startedAt, now);
		const last = groups[groups.length - 1];
		if (last && last.label === label) last.events.push(e);
		else groups.push({ label: label, events: [e] });
	});
	return groups;
}
