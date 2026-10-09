import { fmt } from '../format.js';
import { timeline } from '../recordings.js';
import { h, icon, mosaic, segmented, sheet, syncList } from '../ui.js';
import { cameraName } from './cameras.js';

/** @typedef {{id: EventId, time: string, trigger: Trigger, cameras: string, duration: string, thumbUrl: string}} EventRow */
/** @typedef {{filter: Trigger|'all', groups: {label: string, rows: EventRow[]}[], empty: string,
 *   sheet: {id: EventId, title: string, detail: string, player: Mosaic & {poster: string}, focus: CameraId|null, confirm: {title: string, body: string, action: string}|null}|null}} EventsModel
 * The player's poster is the event thumbnail, shown until the clip plays or when it cannot. confirm is set while the sheet asks before a delete. */

export const TRIGGER_NAMES = { motion: 'Motion', impact: 'Impact' };
const FILTERS = [{ value: 'all', label: 'All' }, { value: 'motion', label: 'Motion' }, { value: 'impact', label: 'Impact' }];
const EMPTY = {
	all: 'No recordings yet. Sentry keeps a clip when it sees someone linger or something hit the car.',
	motion: 'No motion recordings.',
	impact: 'No impact recordings.',
};

function camerasLine(ids) { return ids.map(cameraName).join(', '); }
function dayWord(label) { return label === 'Today' || label === 'Yesterday' ? label.toLowerCase() : label; }

export const events = {
	route: 'events',
	title: 'Events',
	icon: 'film',

	/** Timeline from recordings.js under view.filter, and the open sheet with its delete confirmation. @param {World} world @param {Millis} now @returns {EventsModel} */
	model(world, now) {
		const filter = world.view.filter;
		const groups = timeline(world.events, filter, now).map(function (g) {
			return {
				label: g.label,
				rows: g.events.map(function (e) {
					return { id: e.id, time: fmt.time(e.startedAt), trigger: e.trigger, cameras: camerasLine(e.cameras), duration: fmt.span(e.endedAt - e.startedAt), thumbUrl: e.thumbUrl };
				}),
			};
		});
		const sheetView = world.view.sheet && world.view.sheet.kind === 'event' ? world.view.sheet : null;
		const event = sheetView === null ? null : world.events.filter(function (e) { return e.id === sheetView.id; })[0] || null;
		const title = event ? (TRIGGER_NAMES[event.trigger] || event.trigger) + ', ' + dayWord(fmt.day(event.startedAt, now)) + ' ' + fmt.time(event.startedAt) : '';
		return {
			filter: filter,
			groups: groups,
			empty: groups.length ? '' : EMPTY[filter],
			sheet: event ? {
				id: event.id,
				title: title,
				detail: camerasLine(event.cameras) + ' · ' + fmt.span(event.endedAt - event.startedAt),
				player: { url: event.clipUrl, layout: event.layout, poster: event.thumbUrl },
				focus: world.view.focus && event.layout.indexOf(world.view.focus) >= 0 ? world.view.focus : null,
				confirm: sheetView.confirm ? { title: 'Delete this recording?', body: title + ' will be deleted from the car. It cannot be recovered.', action: 'Delete recording' } : null,
			} : null,
		};
	},

	/** Filter segments, keyed rows, and the sheet with the video mosaic, Export incident pack, and Delete in red, which asks once before dispatching. @param {HTMLElement} root @param {(i: Intent) => void} dispatch */
	mount(root, dispatch) {
		const filter = segmented(FILTERS, function (value) { dispatch({ kind: 'view', patch: { filter: value } }); });
		const groups = h('div', { class: 'content groups' });
		const empty = h('div', { class: 'empty' }, [icon('film'), h('p', {}, [''])]);
		const emptyText = empty.lastChild;

		const closeSheet = function () { dispatch({ kind: 'view', patch: { sheet: null, focus: null } }); };
		const player = mosaic('video', function (camera) { dispatch({ kind: 'view', patch: { focus: camera } }); });
		const sheetTitle = h('h2', { class: 'sheet-title' });
		const sheetDetail = h('p', { class: 'sheet-detail' });
		const playerHint = h('p', { class: 'hint' });
		let openId = null;
		const askDelete = function () { if (openId) dispatch({ kind: 'view', patch: { sheet: { kind: 'event', id: openId, confirm: true } } }); };
		const keep = function () { if (openId) dispatch({ kind: 'view', patch: { sheet: { kind: 'event', id: openId } } }); };
		const sheetContent = h('div', { class: 'sheet-body sheet-player' }, [
			h('div', { class: 'sheet-head' }, [
				h('div', {}, [sheetTitle, sheetDetail]),
				h('button', { class: 'icon-button hit', type: 'button', 'aria-label': 'Close', onclick: closeSheet }, [icon('close')]),
			]),
			player.el,
			playerHint,
			h('div', { class: 'sheet-actions' }, [
				h('button', { class: 'button hit', type: 'button', onclick: function () { if (openId) dispatch({ kind: 'export', id: openId }); } }, [icon('share'), 'Export incident pack']),
				h('button', { class: 'button destructive hit', type: 'button', onclick: askDelete }, [icon('trash'), 'Delete']),
			]),
		]);
		const confirmTitle = h('h2', { class: 'sheet-title' });
		const confirmBody = h('p', { class: 'sheet-detail' });
		const confirmButton = h('button', { class: 'button destructive filled hit', type: 'button', onclick: function () {
			if (openId) dispatch({ kind: 'delete', id: openId });
			closeSheet();
		} }, [icon('trash'), '']);
		const confirmLabel = confirmButton.lastChild;
		const confirmContent = h('div', { class: 'sheet-body' }, [
			h('div', { class: 'sheet-head' }, [confirmTitle, h('button', { class: 'icon-button hit', type: 'button', 'aria-label': 'Close', onclick: closeSheet }, [icon('close')])]),
			confirmBody,
			h('div', { class: 'sheet-actions' }, [
				h('button', { class: 'button hit', type: 'button', onclick: keep }, ['Keep it']),
				confirmButton,
			]),
		]);
		const panel = sheet(closeSheet);

		function openRow(id) { dispatch({ kind: 'view', patch: { sheet: { kind: 'event', id: id }, focus: null } }); }
		function createRow(r) {
			const glyph = icon(r.trigger);
			glyph.classList.add('trigger');
			const el = h('button', { class: 'row row-tap event-row hit', type: 'button', onclick: function () { openRow(r.id); } }, [
				h('img', { class: 'event-thumb', alt: '' }),
				glyph,
				h('span', { class: 'event-text' }, [h('span', { class: 'event-time num' }), h('span', { class: 'event-detail' })]),
				icon('chevron'),
			]);
			return el;
		}
		function updateRow(el, r) {
			const thumb = el.children[0];
			if (thumb.getAttribute('src') !== r.thumbUrl) thumb.setAttribute('src', r.thumbUrl);
			el.children[2].children[0].textContent = r.time;
			el.children[2].children[1].textContent = (TRIGGER_NAMES[r.trigger] || r.trigger) + ' · ' + r.cameras + ' · ' + r.duration;
		}
		function createGroup() {
			return h('section', { class: 'inset' }, [h('h3', { class: 'inset-header' }), h('div', { class: 'inset-rows' })]);
		}
		function updateGroup(el, g) {
			el.children[0].textContent = g.label;
			syncList(el.children[1], g.rows, function (r) { return r.id; }, createRow, updateRow);
		}

		root.appendChild(h('div', { class: 'content' }, [h('div', { class: 'filter-bar' }, [filter.el]), groups, empty, panel.el]));
		return {
			update(m) {
				filter.set(m.filter);
				syncList(groups, m.groups, function (g) { return g.label; }, createGroup, updateGroup);
				emptyText.textContent = m.empty;
				empty.hidden = !m.empty;
				if (m.sheet && m.sheet.confirm) {
					openId = m.sheet.id;
					confirmTitle.textContent = m.sheet.confirm.title;
					confirmBody.textContent = m.sheet.confirm.body;
					confirmLabel.textContent = m.sheet.confirm.action;
					player.hide();
					panel.open(confirmContent);
				} else if (m.sheet) {
					openId = m.sheet.id;
					sheetTitle.textContent = m.sheet.title;
					sheetDetail.textContent = m.sheet.detail;
					player.set(m.sheet.player, m.sheet.focus);
					playerHint.textContent = m.sheet.focus ? 'Tap to see all four cameras.' : 'Tap a camera to enlarge it.';
					panel.open(sheetContent);
				} else {
					openId = null;
					player.hide();
					panel.close();
				}
			},
			hide() { player.hide(); },
		};
	},
};
