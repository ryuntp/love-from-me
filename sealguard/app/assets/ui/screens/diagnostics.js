import { fmt } from '../format.js';
import { h, syncList, toggle } from '../ui.js';
import { cameraName } from './cameras.js';

/** @typedef {{rows: {label: string, value: string, ok: boolean|null}[], selfTest: {name: string, ok: boolean, detail: string}[], killed: boolean}} DiagnosticsModel */

const POWER = { off: 'Off', acc: 'Accessory', on: 'On' };
const AUTOSTART = { allowed: 'Allowed', blocked: 'Blocked by the car', unknown: 'Not checked yet' };
const WAITING = 'Waiting for the car';
const LINK_FRESH_MS = 30e3;

function row(label, value, ok) { return { label: label, value: value, ok: ok }; }

export const diagnostics = {
	route: 'diagnostics',
	title: 'Diagnostics',
	icon: 'wrench',

	/** Camera ids and fps, power level, 12V and HV voltages, SoC, link health, self-test, kill state. @param {World} world @param {Millis} now @returns {DiagnosticsModel} */
	model(world, now) {
		const host = world.host;
		const latest = world.history.latest;
		const link = world.link;
		const rows = [];
		if (!host) rows.push(row('Cameras', WAITING, null));
		else if (!host.cameras.length) rows.push(row('Cameras', 'Off', null));
		else host.cameras.forEach(function (c) { rows.push(row(cameraName(c.id) + ' camera', Math.round(c.fps) + ' fps', c.fps > 0)); });
		if (!latest) {
			rows.push(row('Power', WAITING, null));
		} else {
			rows.push(row('Power', POWER[latest.power] || latest.power, null));
			rows.push(row('12V battery', fmt.volts(latest.v12) + (latest.v12Low ? ', low' : ''), !latest.v12Low && latest.v12 >= world.config.v12Floor));
			rows.push(row('Drive battery', fmt.volts(latest.hvV) + ', ' + fmt.pct(latest.soc), latest.soc > world.config.socFloor));
		}
		rows.push(link.heardAt === null ? row('Last heard from the car', 'Never', false)
			: row('Last heard from the car', fmt.span(Math.max(0, now - link.heardAt)) + ' ago', now - link.heardAt < LINK_FRESH_MS));
		rows.push(row('Unreadable messages', String(link.rejected), link.rejected === 0));
		if (link.lastError) rows.push(row('Last error', link.lastError, false));
		if (host) {
			rows.push(row('Autostart', AUTOSTART[host.autostart] || host.autostart, host.autostart === 'allowed' ? true : host.autostart === 'blocked' ? false : null));
			rows.push(row('Car app', host.version, null));
		}
		return { rows: rows, selfTest: host ? host.selfTest : [], killed: Boolean(host && host.killed) };
	},

	/** Read-only rows and the kill switch, which dispatches kill and shows the car's confirmed state. @param {HTMLElement} root @param {(i: Intent) => void} dispatch */
	mount(root, dispatch) {
		let killed = false;
		const status = h('div', { class: 'inset-rows' });
		const tests = h('div', { class: 'inset-rows' });
		const testsEmpty = h('p', { class: 'inset-footer' });
		const kill = toggle(function () { dispatch({ kind: 'kill', on: !killed }); });
		root.appendChild(h('div', { class: 'content' }, [
			h('section', { class: 'inset' }, [h('h3', { class: 'inset-header' }, ['Status']), status]),
			h('section', { class: 'inset' }, [h('h3', { class: 'inset-header' }, ['Self test']), tests, testsEmpty]),
			h('section', { class: 'inset' }, [
				h('h3', { class: 'inset-header' }, ['Kill switch']),
				h('div', { class: 'inset-rows' }, [h('div', { class: 'row' }, [
					h('div', { class: 'row-text' }, [h('span', { class: 'row-label' }, ['Stop everything']), h('span', { class: 'row-detail' }, ['Turns sentry, recording and the surround cameras off until you turn this back off. The switch shows what the car has confirmed, so it may take a moment to move.'])]),
					h('div', { class: 'row-control' }, [kill.el]),
				])]),
			]),
		]));
		function createStatusRow() {
			return h('div', { class: 'row' }, [h('div', { class: 'row-text' }, [h('span', { class: 'row-label' })]), h('span', { class: 'row-value' }), h('span', { class: 'ok-dot' })]);
		}
		function updateStatusRow(el, r) {
			el.children[0].children[0].textContent = r.label;
			el.children[1].textContent = r.value;
			if (r.ok === null) el.children[2].removeAttribute('data-ok'); else el.children[2].setAttribute('data-ok', String(r.ok));
		}
		function createTestRow() {
			return h('div', { class: 'row' }, [h('div', { class: 'row-text' }, [h('span', { class: 'row-label' }), h('span', { class: 'row-detail' })]), h('span', { class: 'row-value' }), h('span', { class: 'ok-dot' })]);
		}
		function updateTestRow(el, t) {
			el.children[0].children[0].textContent = t.name;
			el.children[0].children[1].textContent = t.detail;
			el.children[1].textContent = t.ok ? 'Passed' : 'Failed';
			el.children[2].setAttribute('data-ok', String(t.ok));
		}
		return {
			update(m) {
				syncList(status, m.rows, function (r) { return r.label; }, createStatusRow, updateStatusRow);
				syncList(tests, m.selfTest, function (t) { return t.name; }, createTestRow, updateTestRow);
				testsEmpty.textContent = m.selfTest.length ? '' : 'The car has not reported a self test yet.';
				killed = m.killed;
				kill.set(m.killed);
			},
			hide() {},
		};
	},
};
