import { h, mosaic, syncList } from '../ui.js';

/** @typedef {{mosaic: Mosaic|null, focus: CameraId|null, cameras: {id: CameraId, quadrant: number, label: string, detail: string}[], offline: string}} CamerasModel
 * cameras follows mosaic.layout, one entry per quadrant; detail is the frame rate, or Offline for a camera the host left out of its list. */

/** Owner names for the four surround cameras; events and diagnostics reuse them. */
export const CAMERA_NAMES = { front: 'Front', rear: 'Rear', left: 'Left', right: 'Right' };

/** Camera id to owner name, with the id itself as the fallback for one the host adds later. @param {string} id */
export function cameraName(id) { return CAMERA_NAMES[id] || id; }

export const cameras = {
	route: 'cameras',
	title: 'Cameras',
	icon: 'camera',

	/** Live mosaic, focused quadrant and one label per quadrant of the layout. @param {World} world @param {Millis} now @returns {CamerasModel} */
	model(world, now) {
		const host = world.host;
		const source = host ? host.mosaic : null;
		const layout = source ? source.layout : [];
		const reported = {};
		if (host) host.cameras.forEach(function (c) { reported[c.id] = c; });
		const focus = world.view.focus && layout.indexOf(world.view.focus) >= 0 ? world.view.focus : null;
		return {
			mosaic: source,
			focus: focus,
			cameras: layout.map(function (id, i) {
				const c = reported[id] || null;
				return { id: id, quadrant: i, label: cameraName(id), detail: c ? Math.round(c.fps) + ' fps' : 'Offline' };
			}),
			offline: !host ? 'Waiting for the car.'
				: host.killed ? 'The kill switch is on. The surround cameras stay off until you turn it off in Diagnostics.'
				: source ? '' : 'The surround cameras are off. They come on while sentry is armed.',
		};
	},

	/** Full-width image mosaic with a label pinned to each quadrant; a tap dispatches view focus. @param {HTMLElement} root @param {(i: Intent) => void} dispatch */
	mount(root, dispatch) {
		const live = mosaic('img', function (camera) { dispatch({ kind: 'view', patch: { focus: camera } }); });
		const labels = h('div', { class: 'stage-labels' });
		const offline = h('p', { class: 'stage-empty', hidden: true });
		const stage = h('div', { class: 'stage' }, [live.el, labels, offline]);
		const hint = h('p', { class: 'hint' });
		root.appendChild(h('div', { class: 'content' }, [stage, hint]));
		return {
			update(m) {
				live.set(m.mosaic, m.focus);
				if (m.focus) stage.setAttribute('data-focused', m.focus); else stage.removeAttribute('data-focused');
				syncList(labels, m.cameras, function (c) { return c.id; },
					function () { return h('span', { class: 'stage-label' }); },
					function (el, c) {
						el.setAttribute('data-quadrant', String(c.quadrant));
						el.textContent = c.label + ' · ' + c.detail;
						el.classList.toggle('active', c.id === m.focus);
					});
				labels.hidden = !m.mosaic;
				offline.textContent = m.offline;
				offline.hidden = !m.offline;
				hint.textContent = !m.mosaic ? '' : m.focus ? 'Tap to see all four cameras.' : 'Tap a camera to enlarge it.';
			},
			hide() { live.hide(); },
		};
	},
};
