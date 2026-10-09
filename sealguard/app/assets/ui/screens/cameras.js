import { h, mosaic, syncList } from '../ui.js';

/** @typedef {{mosaic: Mosaic|null, focus: CameraId|null, cameras: {id: CameraId, label: string, fps: string}[], offline: string}} CamerasModel */

/** Owner names for the four surround cameras; events and diagnostics reuse them. */
export const CAMERA_NAMES = { front: 'Front', rear: 'Rear', left: 'Left', right: 'Right' };

/** Camera id to owner name, with the id itself as the fallback for one the host adds later. @param {string} id */
export function cameraName(id) { return CAMERA_NAMES[id] || id; }

export const cameras = {
	route: 'cameras',
	title: 'Cameras',
	icon: 'camera',

	/** Live mosaic, focused quadrant and per-camera labels in quadrant order. @param {World} world @param {Millis} now @returns {CamerasModel} */
	model(world, now) {
		const host = world.host;
		const source = host ? host.mosaic : null;
		const layout = source ? source.layout : [];
		const list = host ? host.cameras.slice() : [];
		list.sort(function (a, b) { return quadrant(layout, a.id) - quadrant(layout, b.id); });
		const focus = world.view.focus && layout.indexOf(world.view.focus) >= 0 ? world.view.focus : null;
		return {
			mosaic: source,
			focus: focus,
			cameras: list.map(function (c) { return { id: c.id, label: cameraName(c.id), fps: Math.round(c.fps) + ' fps' }; }),
			offline: !host ? 'Waiting for the car.'
				: host.killed ? 'The kill switch is on. The surround cameras stay off until you turn it off in Diagnostics.'
				: source ? '' : 'The surround cameras are off. They come on while sentry is armed.',
		};
	},

	/** Full-width image mosaic; a tap dispatches view focus. @param {HTMLElement} root @param {(i: Intent) => void} dispatch */
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
						el.textContent = c.label + ' · ' + c.fps;
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

function quadrant(layout, id) {
	const i = layout.indexOf(id);
	return i < 0 ? layout.length : i;
}

