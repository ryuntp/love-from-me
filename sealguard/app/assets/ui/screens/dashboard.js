import { fmt } from '../format.js';
import { sentryStatus } from '../sentry.js';
import { runtimeBudget } from '../parking.js';
import * as hub from '../main.js';
import { assessBattery } from '../battery.js';
import { assessTyres } from '../tyres.js';
import { h, icon, mosaic } from '../ui.js';
import { batteryFinding, tyreFinding, tyreRows, WHEEL_NAMES } from './car.js';
import { TRIGGER_NAMES } from './events.js';

/** @typedef {{level: 'good'|'watch'|'act'|'unknown', verdict: string, detail: string}} Tile */
/** @typedef {{tone: Tone, title: string, detail: string, diagnosticsLink: boolean, armedFor: string, v12: string, runtime: string, runtimeWhy: string, lapse: string, lapseWhy: string,
 *   mosaic: Mosaic|null, canArm: boolean, canDisarm: boolean, killed: boolean, battery: Tile, tyres: Tile, lastEvent: Tile}} DashboardModel
 * Every fact value is a number or one word; the sentence behind it sits in the matching why line. */

/** A host that has answered but sent no vehicle message for this long has no vehicle link, whatever sentry is still waiting for. */
const NO_VEHICLE_MS = 15e3;

/** The three tiles under the hero: 12V verdict with its resting voltage, tyre verdict with the flagged wheel, and the newest event. @param {BatteryHealth} battery @param {TyreHealth} tyres @param {VehicleSnapshot|null} latest @param {RecordedEvent[]} events @param {Millis} now @returns {{battery: Tile, tyres: Tile, lastEvent: Tile}} */
export function tiles(battery, tyres, latest, events, now) {
	const b = batteryFinding(battery);
	const t = tyreFinding(tyres);
	const flagged = tyreRows(tyres, latest).filter(function (r) { return r.flagged; })[0];
	const newest = events.reduce(function (best, e) { return !best || e.startedAt > best.startedAt ? e : best; }, null);
	return {
		battery: { level: b.level, verdict: b.verdict, detail: battery.verdict === 'learning' ? (latest ? fmt.volts(latest.v12) + ' now' : 'No reading') : fmt.volts(battery.restingV) + ' resting' },
		tyres: { level: t.level, verdict: t.verdict, detail: flagged ? WHEEL_NAMES[flagged.wheel] + ' · ' + flagged.kpa : latest && latest.tyres ? 'All four read' : 'No reading' },
		lastEvent: newest
			? { level: newest.trigger === 'impact' ? 'act' : 'watch', verdict: TRIGGER_NAMES[newest.trigger] || newest.trigger, detail: fmt.day(newest.startedAt, now) + ' ' + fmt.time(newest.startedAt) }
			: { level: 'unknown', verdict: 'No events yet', detail: 'Clips appear here' },
	};
}

/** The hero's words when the host is up but no reading has come: the first failing self test explains why. @param {HostStatus} host @returns {SentryStatus} */
export function noVehicleStatus(host) {
	const failed = host.selfTest.filter(function (t) { return !t.ok; })[0];
	const detail = failed ? failed.detail || failed.name + ' failed' : 'The car has not sent a reading';
	return { tone: 'alert', title: 'No vehicle data', detail: detail, since: null, canArm: false, canDisarm: false };
}

/** The time-lapse fact from the plan the hub is sending: the cadence while it runs, Stopped for a halt, otherwise Off, each with the plan's reason. @param {SentryStatus} sentry @param {LapsePlan} plan @returns {{value: string, why: string}} */
export function lapseFact(sentry, plan) {
	if (sentry.tone === 'alert') return { value: 'Stopped', why: plan.reason };
	if (plan.kind === 'run') return { value: 'Every ' + fmt.span(plan.intervalS * 1000), why: plan.reason };
	return { value: 'Off', why: plan.reason };
}

export const dashboard = {
	route: 'dashboard',
	title: 'Dashboard',
	icon: 'shield',

	/** Hero facts from sentryStatus, runtimeBudget, the hub's desiredLapse, the latest 12V and the live mosaic; a silent vehicle link replaces the sentry words. @param {World} world @param {Millis} now @returns {DashboardModel} */
	model(world, now) {
		const sentry = sentryStatus(world.sentry, world.config, now);
		const latest = world.history.latest;
		const silent = world.host !== null && latest === null && typeof world.link.statusAt === 'number' && now - world.link.statusAt >= NO_VEHICLE_MS;
		const status = silent ? noVehicleStatus(world.host) : sentry;
		const budget = runtimeBudget(world.history, world.config, now);
		const lapse = lapseFact(sentry, hub.desiredLapse(world, now));
		const watching = sentry.tone === 'armed' || sentry.tone === 'recording';
		const t = tiles(assessBattery(world.history, now), assessTyres(world.history, now), latest, world.events, now);
		return {
			battery: t.battery,
			tyres: t.tyres,
			lastEvent: t.lastEvent,
			tone: status.tone,
			title: status.title,
			detail: status.detail,
			diagnosticsLink: silent,
			armedFor: watching && sentry.since !== null ? fmt.span(Math.max(0, now - sentry.since)) : 'Not armed',
			v12: latest ? fmt.volts(latest.v12) : 'No reading',
			runtime: budget.kind === 'estimate' ? fmt.hours(budget.hours) : budget.kind === 'charging' ? 'Charging' : 'Learning',
			runtimeWhy: budget.reason,
			lapse: lapse.value,
			lapseWhy: lapse.why,
			mosaic: world.host ? world.host.mosaic : null,
			canArm: status.canArm,
			canDisarm: status.canDisarm,
			killed: Boolean(world.host && world.host.killed),
		};
	},

	/** Builds the hero card once; update sets data-tone and copies text and stream. @param {HTMLElement} root @param {(i: Intent) => void} dispatch */
	mount(root, dispatch) {
		const title = h('h2', { class: 'hero-title' });
		const detail = h('p', { class: 'hero-detail' });
		const armedFor = h('dd', { class: 'num' });
		const v12 = h('dd', { class: 'num' });
		const runtime = h('dd', { class: 'num' });
		const runtimeWhy = h('dd', { class: 'fact-why' });
		const lapse = h('dd', { class: 'num' });
		const lapseWhy = h('dd', { class: 'fact-why' });
		const thumb = mosaic('img', null);
		let action = null;
		const button = h('button', { class: 'button filled hit', type: 'button', onclick: function () { if (action) dispatch({ kind: action }); } });
		const diagnosticsLink = h('a', { class: 'button hit', href: '#/diagnostics', hidden: true }, [icon('wrench'), 'Diagnostics']);
		const kill = h('a', { class: 'kill-banner hit', href: '#/diagnostics', hidden: true }, [
			icon('warning'),
			h('span', {}, [h('span', { class: 'kill-title' }, ['Kill switch is on. ']), h('span', { class: 'kill-body' }, ['Sentry and the surround cameras stay off until you turn it off in Diagnostics.'])]),
			icon('chevron'),
		]);
		const hero = h('section', { class: 'card hero', 'data-tone': 'disarmed' }, [
			h('div', { class: 'hero-main' }, [
				h('div', { class: 'hero-state' }, [h('span', { class: 'hero-dot' }), title]),
				detail,
				h('dl', { class: 'hero-facts' }, [
					h('div', { class: 'fact' }, [h('dt', {}, ['Armed for']), armedFor]),
					h('div', { class: 'fact' }, [h('dt', {}, ['12V battery']), v12]),
					h('div', { class: 'fact' }, [h('dt', {}, ['Runtime left']), runtime, runtimeWhy]),
					h('div', { class: 'fact' }, [h('dt', {}, ['Time-lapse']), lapse, lapseWhy]),
				]),
				h('div', { class: 'hero-actions' }, [button, diagnosticsLink]),
			]),
			h('a', { class: 'hero-mosaic hit', href: '#/cameras' }, [
				thumb.el,
				h('span', { class: 'hero-mosaic-caption' }, [h('span', {}, ['Surround cameras']), icon('chevron')]),
			]),
		]);
		const tileEls = {};
		const tileRow = h('div', { class: 'tiles' }, [['battery', '12V battery', '#/car'], ['tyres', 'Tyres', '#/car'], ['lastEvent', 'Last event', '#/events']].map(function (spec) {
			const verdict = h('span', { class: 'tile-verdict' });
			const detail = h('span', { class: 'tile-detail' });
			const el = h('a', { class: 'tile hit', href: spec[2], 'data-level': 'unknown' }, [h('span', { class: 'tile-label' }, [spec[1]]), verdict, detail, icon('chevron')]);
			tileEls[spec[0]] = { el: el, verdict: verdict, detail: detail };
			return el;
		}));
		root.appendChild(h('div', { class: 'content' }, [kill, hero, tileRow]));
		function setTile(slot, tile) {
			slot.el.setAttribute('data-level', tile.level);
			slot.verdict.textContent = tile.verdict;
			slot.detail.textContent = tile.detail;
		}
		return {
			update(m) {
				setTile(tileEls.battery, m.battery);
				setTile(tileEls.tyres, m.tyres);
				setTile(tileEls.lastEvent, m.lastEvent);
				hero.setAttribute('data-tone', m.tone);
				title.textContent = m.title;
				detail.textContent = m.detail;
				diagnosticsLink.hidden = !m.diagnosticsLink;
				armedFor.textContent = m.armedFor;
				v12.textContent = m.v12;
				runtime.textContent = m.runtime;
				runtimeWhy.textContent = m.runtimeWhy;
				lapse.textContent = m.lapse;
				lapseWhy.textContent = m.lapseWhy;
				thumb.set(m.mosaic, null);
				action = m.canDisarm ? 'disarm' : m.canArm ? 'arm' : null;
				button.textContent = m.canDisarm ? 'Disarm' : 'Arm';
				button.disabled = action === null;
				kill.hidden = !m.killed;
			},
			hide() { thumb.hide(); },
		};
	},
};
