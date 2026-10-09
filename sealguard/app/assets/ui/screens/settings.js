import { FIELDS } from '../config.js';
import { fmt } from '../format.js';
import { runtimeBudget } from '../parking.js';
import { expiredEvents } from '../recordings.js';
import { h, icon, insetList, segmented, sheet, stepper, toggle } from '../ui.js';

/** @typedef {{key: string, label: string, value: string|number|boolean, display: string}} SettingRow */
/** @typedef {{config: Config, rows: SettingRow[], floorsFooter: string, wouldDelete: Record<number, number>, version: string, sheet: {days: number, count: number}|null}} SettingsModel */

const VISIBLE = FIELDS.filter(function (f) { return f.group !== null; });
const RETENTION = FIELDS.filter(function (f) { return f.key === 'retentionDays'; })[0];
const GROUPS = VISIBLE.map(function (f) { return f.group; }).filter(function (g, i, all) { return all.indexOf(g) === i; });

/** The owner-facing text for a field's value: the option label, the number with the spec's unit and digits, or On and Off. @param {Field} field @param {any} value */
export function display(field, value) {
	const spec = field.spec;
	if (spec.kind === 'flag') return value ? 'On' : 'Off';
	if (spec.kind === 'range') return value.toFixed(spec.digits) + (spec.unit === '%' ? '' : ' ') + spec.unit;
	const option = spec.options.filter(function (o) { return o.value === value; })[0];
	return option ? option.label : String(value);
}

function recordings(n) { return n + (n === 1 ? ' recording' : ' recordings'); }

export const settings = {
	route: 'settings',
	title: 'Settings',
	icon: 'gear',

	/** Current values, the runtime at the chosen floors, and how many events each retention choice would delete. @param {World} world @param {Millis} now @returns {SettingsModel} */
	model(world, now) {
		const config = world.config;
		const budget = runtimeBudget(world.history, config, now);
		const wouldDelete = {};
		RETENTION.spec.options.forEach(function (o) { wouldDelete[o.value] = expiredEvents(world.events, o.value, now).length; });
		const open = world.view.sheet && world.view.sheet.kind === 'retention' ? world.view.sheet.days : null;
		return {
			config: config,
			rows: VISIBLE.map(function (f) { return { key: f.key, label: f.label, value: config[f.key], display: display(f, config[f.key]) }; }),
			floorsFooter: budget.kind === 'estimate'
				? 'At these floors sentry can keep watching for ' + fmt.hours(budget.hours) + ' before the ' + (budget.limitedBy === 'soc' ? 'drive battery' : '12V') + ' floor stops it.'
				: budget.reason,
			wouldDelete: wouldDelete,
			version: world.host ? world.host.version : 'Waiting for the car',
			sheet: open === null ? null : { days: open, count: wouldDelete[open] || 0 },
		};
	},

	/** Inset lists whose controls come from FIELDS; each change dispatches setConfig, retention through a confirmation when it deletes. @param {HTMLElement} root @param {(i: Intent) => void} dispatch */
	mount(root, dispatch) {
		let model = null;
		const controls = {};
		function change(key, value) {
			if (key === 'retentionDays' && model && model.wouldDelete[value] > 0) {
				dispatch({ kind: 'view', patch: { sheet: { kind: 'retention', days: value } } });
				return;
			}
			const patch = {};
			patch[key] = value;
			dispatch({ kind: 'setConfig', patch: patch });
		}
		function controlFor(f) {
			const spec = f.spec;
			if (spec.kind === 'flag') return toggle(function (on) { change(f.key, on); });
			if (spec.kind === 'range') return stepper(spec, function (v) { return display(f, v); }, function (v) { change(f.key, v); });
			return segmented(spec.options, function (v) { change(f.key, v); });
		}
		const floorsFooter = h('span', {});
		const version = h('span', { class: 'row-value num' });
		const sections = GROUPS.map(function (group) {
			return {
				header: group,
				footer: group === 'Power' ? floorsFooter : '',
				rows: VISIBLE.filter(function (f) { return f.group === group; }).map(function (f) {
					controls[f.key] = controlFor(f);
					return { label: f.label, detail: f.footer, control: controls[f.key], onTap: null, href: null, tone: null };
				}),
			};
		});
		sections.push({
			header: 'About',
			footer: 'SealGuard is not affiliated with BYD.',
			rows: [
				{ label: 'Version', detail: '', control: { el: version, set: function () {} }, onTap: null, href: null, tone: null },
				{ label: 'Typeface', detail: 'Inter, under the SIL Open Font License', control: null, onTap: null, href: 'fonts/LICENSE.txt', tone: null },
			],
		});

		const closeSheet = function () { dispatch({ kind: 'view', patch: { sheet: null } }); };
		const confirmTitle = h('h2', { class: 'sheet-title' });
		const confirmBody = h('p', { class: 'sheet-detail' });
		const confirmButton = h('button', { class: 'button destructive filled hit', type: 'button', onclick: function () {
			if (model && model.sheet) dispatch({ kind: 'setConfig', patch: { retentionDays: model.sheet.days } });
			closeSheet();
		} }, [icon('trash'), '']);
		const confirmLabel = confirmButton.lastChild;
		const confirm = h('div', { class: 'sheet-body' }, [
			h('div', { class: 'sheet-head' }, [confirmTitle, h('button', { class: 'icon-button hit', type: 'button', 'aria-label': 'Close', onclick: closeSheet }, [icon('close')])]),
			confirmBody,
			h('div', { class: 'sheet-actions' }, [
				h('button', { class: 'button hit', type: 'button', onclick: closeSheet }, ['Keep them']),
				confirmButton,
			]),
		]);
		const panel = sheet(closeSheet);

		const list = insetList(sections);
		list.appendChild(panel.el);
		root.appendChild(list);
		return {
			update(m) {
				model = m;
				m.rows.forEach(function (r) { controls[r.key].set(r.value); });
				floorsFooter.textContent = m.floorsFooter;
				version.textContent = m.version;
				if (m.sheet) {
					confirmTitle.textContent = 'Keep events for ' + m.sheet.days + ' days?';
					confirmBody.textContent = recordings(m.sheet.count) + ' older than ' + m.sheet.days + ' days will be deleted from the car. Newer ones stay.';
					confirmLabel.textContent = 'Delete ' + recordings(m.sheet.count);
					panel.open(confirm);
				} else {
					panel.close();
				}
			},
			hide() {},
		};
	},
};
