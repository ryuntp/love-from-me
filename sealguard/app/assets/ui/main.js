// The hub: World and the one function that replaces it. advance routes each input to its owning module, seals the incident
// pack when a clip closes, and diffs the time-lapse plan against the last lapse command, so "what can change X" has one answer.
import { parseConfig } from './config.js';
import { record } from './telemetry.js';
import { INITIAL_SENTRY, step } from './sentry.js';
import { runtimeBudget, lapsePlan } from './parking.js';
import { incidentPack, expiredEvents } from './recordings.js';

/** @typedef {'dashboard'|'events'|'cameras'|'car'|'settings'|'diagnostics'|'onboarding'} Route  parsed from location.hash, which is a boundary like any other */
/** @typedef {{kind: 'event', id: EventId, confirm?: boolean} | {kind: 'retention', days: number}} Sheet  confirm is set while the event's delete confirmation shows */
/** @typedef {{route: Route, filter: Trigger|'all', sheet: Sheet|null, focus: CameraId|null, step: number, killAsked: {on: boolean, at: Millis}|null}} ViewState
 * only boot writes route, from the hash; step is the onboarding page; killAsked is the owner's last kill switch tap, set by a view patch and cleared once host.killed matches it */
/**
 * @typedef {{kind: 'arm'} | {kind: 'disarm'} | {kind: 'setConfig', patch: Partial<Config>}
 *   | {kind: 'kill', on: boolean} | {kind: 'export', id: EventId} | {kind: 'delete', id: EventId}
 *   | {kind: 'openAutostart'} | {kind: 'view', patch: Partial<ViewState>}} Intent
 */
/** @typedef {HostInput | Intent | {kind: 'tick'}} Input */
/** @typedef {Command | Alert} Effect  what advance returns for app.js to run */
/** @typedef {{heardAt: Millis|null, statusAt: Millis|null, vehicleAt: Millis|null, rejected: number, lastError: string, deleting: EventId[]}} Link
 * page times of the last host message, the first status and the last vehicle message, the rejected count, and the ids already sent for deletion this session */
/** @typedef {{config: Config, history: History, sentry: SentryState, lapse: {session: SessionId, intervalS: number}|null, host: HostStatus|null, events: RecordedEvent[],
 *   link: Link, view: ViewState}} World  lapse is the last lapse command sent, so advance can diff the plan against it */
/** @typedef {{bridge: Bridge, clock: Clock, storage: StorageLike, onAlert: (alert: Extract<Effect, {kind: 'alert'}>) => void}} AppOptions */
/** @typedef {{dispatch: (input: Input) => void, world: () => World, subscribe: (fn: () => void) => void}} App */
/** @template M @typedef {{route: Route, title: string, icon: string, model: (world: World, now: Millis) => M,
 *   mount: (root: HTMLElement, dispatch: (intent: Intent) => void) => {update: (m: M) => void, hide: () => void}}} Screen
 * model decides every word, number and tone; update only copies them into nodes; hide stops streams. */

const SENTRY_INPUTS = ['vehicle', 'detection', 'status', 'tick', 'arm', 'disarm', 'setConfig'];
const HOST_INPUTS = ['vehicle', 'detection', 'status', 'events', 'exported', 'rejected'];
const LAPSE_MODES = ['idle', 'armed', 'recording'];
/** Why no time-lapse runs outside the parked modes, for the dashboard's time-lapse line. */
const LAPSE_OFF = { starting: 'Waiting for the car', driving: 'Runs while parked', halted: 'Stopped to protect the battery', off: 'Kill switch on' };
/** A host stamp this far ahead of the page clock is a clock fault, not a time; one before this date is a boot clock. */
const AHEAD_MS = 5 * 60e3;
const EPOCH_MS = Date.UTC(2024, 0, 1);

/** The World before any host message. @param {Config} config @param {History} history @returns {World} */
export function initialWorld(config, history) {
	return {
		config: config, history: history, sentry: INITIAL_SENTRY, lapse: null, host: null, events: [],
		link: { heardAt: null, statusAt: null, vehicleAt: null, rejected: 0, lastError: '', deleting: [] },
		view: { route: 'dashboard', filter: 'all', sheet: null, focus: null, step: 0, killAsked: null },
	};
}

function with_(world, patch) { return Object.assign({}, world, patch); }
function withLink(world, patch) { return with_(world, { link: Object.assign({}, world.link, patch) }); }
/** Asks the host to delete the expired events it has not been asked about yet, so a host that cannot delete is asked once per id and not on every index. */
function deletions(world, events, now) {
	const ids = expiredEvents(events, world.config.retentionDays, now).filter(function (id) { return world.link.deleting.indexOf(id) === -1; });
	if (!ids.length) return { world: world, effects: [] };
	return { world: withLink(world, { deleting: world.link.deleting.concat(ids) }), effects: [{ kind: 'deleteEvents', ids: ids }] };
}

/** Each input kind's owner: the World slice it changes and the commands it asks for, before sentry and the lapse plan run. */
const ROUTES = {
	vehicle: function (w, i) { return { world: with_(w, { history: record(w.history, i.snapshot) }), effects: [] }; },
	detection: function (w) { return { world: w, effects: [] }; },
	status: function (w, i) {
		const asked = w.view.killAsked;
		const view = asked !== null && i.status.killed === asked.on ? Object.assign({}, w.view, { killAsked: null }) : w.view;
		return { world: with_(w, { host: i.status, lapse: i.status.lapse, view: view }), effects: [] };
	},
	events: function (w, i, now) { return deletions(with_(w, { events: i.events }), i.events, now); },
	exported: function (w, i) {
		const alert = i.ok
			? { kind: 'alert', tone: 'armed', title: 'Incident pack exported', body: i.where ? 'Saved to ' + i.where : 'Saved on the car' }
			: { kind: 'alert', tone: 'alert', title: 'Export failed', body: i.where || 'The car could not write the file' };
		return { world: w, effects: [alert] };
	},
	rejected: function (w, i) { return { world: withLink(w, { rejected: w.link.rejected + 1, lastError: i.reason }), effects: [] }; },
	tick: function (w) { return { world: w, effects: [] }; },
	arm: function (w) { return { world: w, effects: [] }; },
	disarm: function (w) { return { world: w, effects: [] }; },
	setConfig: function (w, i, now) {
		const config = parseConfig(Object.assign({}, w.config, i.patch));
		const next = with_(w, { config: config });
		return config.retentionDays !== w.config.retentionDays ? deletions(next, w.events, now) : { world: next, effects: [] };
	},
	kill: function (w, i) { return { world: w, effects: [{ kind: 'setKill', on: i.on }] }; },
	export: function (w, i) { return { world: w, effects: [{ kind: 'exportEvent', id: i.id }] }; },
	delete: function (w, i) {
		const sheet = w.view.sheet !== null && w.view.sheet.kind === 'event' && w.view.sheet.id === i.id ? null : w.view.sheet;
		const view = sheet === w.view.sheet ? w.view : Object.assign({}, w.view, { sheet: sheet });
		const deleting = w.link.deleting.indexOf(i.id) === -1 ? w.link.deleting.concat([i.id]) : w.link.deleting;
		return { world: with_(w, { view: view, link: Object.assign({}, w.link, { deleting: deleting }) }), effects: [{ kind: 'deleteEvents', ids: [i.id] }] };
	},
	openAutostart: function (w) { return { world: w, effects: [{ kind: 'openAutostart' }] }; },
	view: function (w, i) {
		// A sheet belongs to the screen it opened on, so the back key cannot carry it to the next route.
		const moved = i.patch.route !== undefined && i.patch.route !== w.view.route;
		return { world: with_(w, { view: Object.assign({}, w.view, moved ? { sheet: null, focus: null } : null, i.patch) }), effects: [] };
	},
};

function tooFarAhead(field, at, now) { return at > now + AHEAD_MS ? field + ' must not be over five minutes ahead' : null; }
/** The reason a host input's times cannot be trusted against the page clock, or null. */
function clockFault(input, now) {
	if (input.kind === 'vehicle') return tooFarAhead('at', input.snapshot.at, now);
	if (input.kind === 'detection') return tooFarAhead('at', input.at, now);
	if (input.kind === 'status') {
		const s = input.status;
		return (s.watch !== null ? tooFarAhead('watch.since', s.watch.since, now) : null)
			|| (s.recording !== null ? tooFarAhead('recording.startedAt', s.recording.startedAt, now) || tooFarAhead('recording.lastSeenAt', s.recording.lastSeenAt, now) : null);
	}
	if (input.kind === 'events') {
		for (let i = 0; i < input.events.length; i++) {
			const e = input.events[i];
			const path = 'events[' + i + ']';
			if (e.startedAt < EPOCH_MS) return path + '.startedAt must not be before 2024';
			const fault = tooFarAhead(path + '.startedAt', e.startedAt, now) || tooFarAhead(path + '.endedAt', e.endedAt, now);
			if (fault !== null) return fault;
		}
	}
	return null;
}
/** The input the hub runs: a host time the page clock cannot accept becomes a rejected input, and a detection stamped a little ahead is read as now. */
function gated(input, now) {
	const fault = clockFault(input, now);
	if (fault !== null) return { kind: 'rejected', reason: fault };
	return input.kind === 'detection' && input.at > now ? Object.assign({}, input, { at: now }) : input;
}

/** The time-lapse plan for this World, the one the dashboard shows and the hub sends: off with the reason outside the parked modes, else the band the runtime budget allows, keeping the band already running for this park. @param {World} world @param {Millis} now @returns {LapsePlan} */
export function desiredLapse(world, now) {
	const sentry = world.sentry;
	if (LAPSE_MODES.indexOf(sentry.mode) === -1) return { kind: 'off', reason: LAPSE_OFF[sentry.mode] };
	const current = world.lapse !== null && world.lapse.session === sentry.park.id ? world.lapse.intervalS : null;
	return lapsePlan(runtimeBudget(world.history, world.config, now), world.config, current);
}
/** The lapse command a plan asks for. While sentry is starting it is world.lapse itself, so a reload never splits the park's clip before sentry has adopted what the host runs. */
function lapseCommand(world, plan) {
	if (world.sentry.mode === 'starting') return world.lapse;
	return plan.kind === 'run' ? { session: world.sentry.park.id, intervalS: plan.intervalS } : null;
}
function sameLapse(a, b) { return a === b || (a !== null && b !== null && a.session === b.session && a.intervalS === b.intervalS); }

/** The only writer of World: routes one input to its owning module, turns clipClosed into saveEvent with the pack, diffs the lapse plan against world.lapse, and returns the next World and the effects to run. @param {World} world @param {Input} input @param {Millis} now @returns {{world: World, effects: Effect[]}} */
export function advance(world, input, now) {
	const accepted = gated(input, now);
	const route = Object.prototype.hasOwnProperty.call(ROUTES, accepted.kind) ? ROUTES[accepted.kind] : null;
	const routed = route === null ? { world: world, effects: [] } : route(world, accepted, now);
	let next = routed.world;
	let effects = routed.effects;
	if (HOST_INPUTS.indexOf(accepted.kind) >= 0) {
		const stamps = { heardAt: now };
		if (accepted.kind === 'status' && next.link.statusAt === null) stamps.statusAt = now;
		if (accepted.kind === 'vehicle') stamps.vehicleAt = now;
		next = withLink(next, stamps);
	}
	// A snapshot history refused as out of order never reaches sentry, or a delayed parked sample could arm the car while it drives.
	const forSentry = SENTRY_INPUTS.indexOf(accepted.kind) >= 0 && (accepted.kind !== 'vehicle' || next.history.latest === accepted.snapshot);
	if (forSentry) {
		const t = step(next.sentry, accepted, next.config, now);
		const history = next.history;
		const preRollS = next.config.preRollS;
		next = with_(next, { sentry: t.state });
		effects = effects.concat(t.effects.map(function (e) {
			return e.kind === 'clipClosed' ? { kind: 'saveEvent', event: e.event, pack: incidentPack(e.event, history, preRollS) } : e;
		}));
	}
	const lapse = lapseCommand(next, desiredLapse(next, now));
	if (!sameLapse(lapse, next.lapse)) {
		effects = effects.concat([lapse === null ? { kind: 'stopLapse', session: next.lapse.session } : { kind: 'startLapse', session: lapse.session, intervalS: lapse.intervalS }]);
		next = with_(next, { lapse: lapse });
	}
	return { world: next, effects: effects };
}
