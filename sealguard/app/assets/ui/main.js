// The hub: World and the one function that replaces it. advance routes each input to its owning module, seals the incident
// pack when a clip closes, and diffs the time-lapse plan against the last lapse command, so "what can change X" has one answer.
import { parseConfig } from './config.js';
import { record } from './telemetry.js';
import { INITIAL_SENTRY, step } from './sentry.js';
import { runtimeBudget, lapsePlan } from './parking.js';
import { incidentPack, expiredEvents } from './recordings.js';

/** @typedef {'dashboard'|'events'|'cameras'|'car'|'settings'|'diagnostics'|'onboarding'} Route  parsed from location.hash, which is a boundary like any other */
/** @typedef {{kind: 'event', id: EventId} | {kind: 'retention', days: number}} Sheet */
/** @typedef {{route: Route, filter: Trigger|'all', sheet: Sheet|null, focus: CameraId|null, step: number}} ViewState  only boot writes route, from the hash; step is the onboarding page */
/**
 * @typedef {{kind: 'arm'} | {kind: 'disarm'} | {kind: 'setConfig', patch: Partial<Config>}
 *   | {kind: 'kill', on: boolean} | {kind: 'export', id: EventId} | {kind: 'delete', id: EventId}
 *   | {kind: 'openAutostart'} | {kind: 'view', patch: Partial<ViewState>}} Intent
 */
/** @typedef {HostInput | Intent | {kind: 'tick'}} Input */
/** @typedef {Command | Alert} Effect  what advance returns for app.js to run */
/** @typedef {{config: Config, history: History, sentry: SentryState, lapse: {session: SessionId, intervalS: number}|null, host: HostStatus|null, events: RecordedEvent[],
 *   link: {heardAt: Millis|null, rejected: number, lastError: string}, view: ViewState}} World  lapse is the last lapse command sent, so advance can diff the plan against it */
/** @typedef {{bridge: Bridge, clock: Clock, storage: StorageLike, onAlert: (alert: Extract<Effect, {kind: 'alert'}>) => void}} AppOptions */
/** @typedef {{dispatch: (input: Input) => void, world: () => World, subscribe: (fn: () => void) => void}} App */
/** @template M @typedef {{route: Route, title: string, icon: string, model: (world: World, now: Millis) => M,
 *   mount: (root: HTMLElement, dispatch: (intent: Intent) => void) => {update: (m: M) => void, hide: () => void}}} Screen
 * model decides every word, number and tone; update only copies them into nodes; hide stops streams. */

const SENTRY_INPUTS = ['vehicle', 'detection', 'status', 'tick', 'arm', 'disarm', 'setConfig'];
const HOST_INPUTS = ['vehicle', 'detection', 'status', 'events', 'exported', 'rejected'];
const LAPSE_MODES = ['idle', 'armed', 'recording'];

/** The World before any host message. @param {Config} config @param {History} history @returns {World} */
export function initialWorld(config, history) {
	return {
		config: config, history: history, sentry: INITIAL_SENTRY, lapse: null, host: null, events: [],
		link: { heardAt: null, rejected: 0, lastError: '' },
		view: { route: 'dashboard', filter: 'all', sheet: null, focus: null, step: 0 },
	};
}

function with_(world, patch) { return Object.assign({}, world, patch); }
function deletions(events, config, now) {
	const ids = expiredEvents(events, config.retentionDays, now);
	return ids.length ? [{ kind: 'deleteEvents', ids: ids }] : [];
}

/** Each input kind's owner: the World slice it changes and the commands it asks for, before sentry and the lapse plan run. */
const ROUTES = {
	vehicle: function (w, i) { return { world: with_(w, { history: record(w.history, i.snapshot) }), effects: [] }; },
	detection: function (w) { return { world: w, effects: [] }; },
	status: function (w, i) { return { world: with_(w, { host: i.status, lapse: i.status.lapse }), effects: [] }; },
	events: function (w, i, now) { return { world: with_(w, { events: i.events }), effects: deletions(i.events, w.config, now) }; },
	exported: function (w, i) {
		const alert = i.ok
			? { kind: 'alert', tone: 'armed', title: 'Incident pack exported', body: i.where ? 'Saved to ' + i.where : 'Saved on the car' }
			: { kind: 'alert', tone: 'alert', title: 'Export failed', body: i.where || 'The car could not write the file' };
		return { world: w, effects: [alert] };
	},
	rejected: function (w, i) { return { world: with_(w, { link: Object.assign({}, w.link, { rejected: w.link.rejected + 1, lastError: i.reason }) }), effects: [] }; },
	tick: function (w) { return { world: w, effects: [] }; },
	arm: function (w) { return { world: w, effects: [] }; },
	disarm: function (w) { return { world: w, effects: [] }; },
	setConfig: function (w, i, now) {
		const config = parseConfig(Object.assign({}, w.config, i.patch));
		return { world: with_(w, { config: config }), effects: config.retentionDays !== w.config.retentionDays ? deletions(w.events, config, now) : [] };
	},
	kill: function (w, i) { return { world: w, effects: [{ kind: 'setKill', on: i.on }] }; },
	export: function (w, i) { return { world: w, effects: [{ kind: 'exportEvent', id: i.id }] }; },
	delete: function (w, i) {
		const sheet = w.view.sheet !== null && w.view.sheet.kind === 'event' && w.view.sheet.id === i.id ? null : w.view.sheet;
		return { world: sheet === w.view.sheet ? w : with_(w, { view: Object.assign({}, w.view, { sheet: sheet }) }), effects: [{ kind: 'deleteEvents', ids: [i.id] }] };
	},
	openAutostart: function (w) { return { world: w, effects: [{ kind: 'openAutostart' }] }; },
	view: function (w, i) { return { world: with_(w, { view: Object.assign({}, w.view, i.patch) }), effects: [] }; },
};

function desiredLapse(world, now) {
	const sentry = world.sentry;
	if (LAPSE_MODES.indexOf(sentry.mode) === -1) return null;
	const plan = lapsePlan(runtimeBudget(world.history, world.config, now), world.config);
	return plan.kind === 'run' ? { session: sentry.park.id, intervalS: plan.intervalS } : null;
}
function sameLapse(a, b) { return a === b || (a !== null && b !== null && a.session === b.session && a.intervalS === b.intervalS); }

/** The only writer of World: routes one input to its owning module, turns clipClosed into saveEvent with the pack, diffs the lapse plan against world.lapse, and returns the next World and the effects to run. @param {World} world @param {Input} input @param {Millis} now @returns {{world: World, effects: Effect[]}} */
export function advance(world, input, now) {
	const route = Object.prototype.hasOwnProperty.call(ROUTES, input.kind) ? ROUTES[input.kind] : null;
	const routed = route === null ? { world: world, effects: [] } : route(world, input, now);
	let next = routed.world;
	let effects = routed.effects;
	if (HOST_INPUTS.indexOf(input.kind) >= 0) next = with_(next, { link: Object.assign({}, next.link, { heardAt: now }) });
	if (SENTRY_INPUTS.indexOf(input.kind) >= 0) {
		const t = step(next.sentry, input, next.config, now);
		const history = next.history;
		const preRollS = next.config.preRollS;
		next = with_(next, { sentry: t.state });
		effects = effects.concat(t.effects.map(function (e) {
			return e.kind === 'clipClosed' ? { kind: 'saveEvent', event: e.event, pack: incidentPack(e.event, history, preRollS) } : e;
		}));
	}
	const lapse = desiredLapse(next, now);
	if (!sameLapse(lapse, next.lapse)) {
		effects = effects.concat([lapse === null ? { kind: 'stopLapse', session: next.lapse.session } : { kind: 'startLapse', session: lapse.session, intervalS: lapse.intervalS }]);
		next = with_(next, { lapse: lapse });
	}
	return { world: next, effects: effects };
}
