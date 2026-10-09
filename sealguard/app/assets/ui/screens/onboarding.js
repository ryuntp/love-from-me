import { FIELDS } from '../config.js';
import { h, icon, segmented } from '../ui.js';

/** @typedef {{step: number, autostart: 'allowed'|'blocked'|'unknown', arming: string}} OnboardingModel */

const ARMING = FIELDS.filter(function (f) { return f.key === 'arming'; })[0];
const PAGES = 4;
const AUTOSTART = {
	allowed: { text: 'Allowed. SealGuard starts with the car.', tone: 'armed' },
	blocked: { text: 'Blocked. Allow SealGuard in the car settings.', tone: 'alert' },
	unknown: { text: 'Not checked yet.', tone: 'disarmed' },
};

export const onboarding = {
	route: 'onboarding',
	title: 'Welcome',
	icon: 'shield',

	/** Page index, the host's autostart reading and the chosen rule; shown while config.onboarded is false and at #/onboarding. @param {World} world @param {Millis} now @returns {OnboardingModel} */
	model(world, now) {
		const option = ARMING.spec.options.filter(function (o) { return o.value === world.config.arming; })[0];
		return {
			step: Math.min(PAGES - 1, Math.max(0, world.view.step || 0)),
			autostart: world.host ? world.host.autostart : 'unknown',
			arming: option ? option.label : String(world.config.arming),
		};
	},

	/** Four pages; Open car settings dispatches openAutostart; Done dispatches setConfig with onboarded true. @param {HTMLElement} root @param {(i: Intent) => void} dispatch */
	mount(root, dispatch) {
		let step = 0;
		function glyph(name) { const el = icon(name); el.classList.add('page-icon'); return el; }
		function go(delta) { dispatch({ kind: 'view', patch: { step: step + delta } }); }
		function footer(index) {
			return h('div', { class: 'page-footer' }, [
				h('div', { class: 'dots' }, [0, 1, 2, 3].map(function () { return h('span', { class: 'dot' }); })),
				h('div', { class: 'page-actions' }, [
					index === 0 ? null : h('button', { class: 'button hit', type: 'button', onclick: function () { go(-1); } }, ['Back']),
					index === PAGES - 1
						? h('a', { class: 'button filled hit', href: '#/dashboard', onclick: function () { dispatch({ kind: 'setConfig', patch: { onboarded: true } }); } }, ['Done'])
						: h('button', { class: 'button filled hit', type: 'button', onclick: function () { go(1); } }, ['Continue']),
				]),
			]);
		}
		const autostartText = h('span', { class: 'row-value' });
		const autostartRow = h('div', { class: 'row', 'data-tone': 'disarmed' }, [h('div', { class: 'row-text' }, [h('span', { class: 'row-label' }, ['Autostart'])]), autostartText]);
		const arming = segmented(ARMING.spec.options, function (value) { dispatch({ kind: 'setConfig', patch: { arming: value } }); });
		const doneLine = h('p', { class: 'page-body' });
		const pages = [
			h('section', { class: 'page' }, [
				glyph('shield'),
				h('h2', { class: 'page-title' }, ['Sentry watches the car while it is parked']),
				h('p', { class: 'page-body' }, ['With sentry armed, the surround cameras watch for anyone who lingers and for anything that hits the car. Each event keeps a recording from just before the trigger, together with what the car was doing at that moment.']),
				h('p', { class: 'page-body' }, ['Sentry stops before the batteries run low, so you can always drive home.']),
			]),
			h('section', { class: 'page' }, [
				glyph('power'),
				h('h2', { class: 'page-title' }, ['Let SealGuard start with the car']),
				h('p', { class: 'page-body' }, ['The car stops apps from starting on their own after every install. Allow SealGuard in the car settings so sentry is ready each time you park.']),
				h('div', { class: 'page-controls' }, [
					h('div', { class: 'inset-rows' }, [autostartRow]),
					h('button', { class: 'button hit', type: 'button', onclick: function () { dispatch({ kind: 'openAutostart' }); } }, ['Open car settings']),
				]),
			]),
			h('section', { class: 'page' }, [
				glyph('lock'),
				h('h2', { class: 'page-title' }, ['When should sentry arm?']),
				h('div', { class: 'page-controls' }, [arming.el]),
				h('p', { class: 'page-body' }, [ARMING.footer]),
			]),
			h('section', { class: 'page' }, [
				glyph('check'),
				h('h2', { class: 'page-title' }, ['You are set']),
				doneLine,
				h('p', { class: 'page-body' }, ['Change this and more in Settings. Diagnostics shows what the car reports if something looks off.']),
			]),
		];
		const footers = pages.map(function (page, i) {
			const f = footer(i);
			page.appendChild(f);
			return f;
		});
		root.appendChild(h('div', { class: 'pages' }, pages));
		return {
			update(m) {
				step = m.step;
				pages.forEach(function (page, i) {
					page.hidden = i !== m.step;
					const dots = footers[i].children[0].children;
					for (let d = 0; d < dots.length; d++) dots[d].classList.toggle('active', d === m.step);
				});
				const a = AUTOSTART[m.autostart] || AUTOSTART.unknown;
				autostartText.textContent = a.text;
				autostartRow.setAttribute('data-tone', a.tone);
				const chosen = ARMING.spec.options.filter(function (o) { return o.label === m.arming; })[0];
				arming.set(chosen ? chosen.value : null);
				doneLine.textContent = 'Sentry arms ' + m.arming.charAt(0).toLowerCase() + m.arming.slice(1) + '. Have a safe drive.';
			},
			hide() {},
		};
	},
};
