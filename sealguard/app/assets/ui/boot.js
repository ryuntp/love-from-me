// The DOM shell: the only module that may touch window and document. It mounts navigation and every screen once,
// turns the hash into view intents, applies theme and motion, renders once per frame after a change and
// draws the night surface over an armed, untouched car.
import { createApp } from './app.js';
import { sentryStatus } from './sentry.js';
import { h, navigation, largeTitle, showAlert, icon } from './ui.js';
import { dashboard } from './screens/dashboard.js';
import { events } from './screens/events.js';
import { cameras } from './screens/cameras.js';
import { car } from './screens/car.js';
import { settings } from './screens/settings.js';
import { diagnostics } from './screens/diagnostics.js';
import { onboarding } from './screens/onboarding.js';

const SCREENS = [dashboard, events, cameras, car, settings, diagnostics, onboarding];
const NAV = SCREENS.slice(0, 6);
const NIGHT_AFTER_MS = 30e3;

function routeOf(hash) {
	const name = (hash || '').replace(/^#\/?/, '').split(/[/?]/)[0];
	return SCREENS.some(function (s) { return s.route === name; }) ? name : 'dashboard';
}

/** Mounts navigation and screens, turns load and hashchange into view intents so the head unit's back button walks hash history, applies theme, reduced motion and the night surface, renders once per frame after a change. @param {Window} win @param {Bridge} bridge @param {Clock} [clock] */
export function boot(win, bridge, clock) {
	const doc = win.document;
	const root = doc.documentElement;
	if (!clock) clock = { now: function () { return Date.now(); }, every: function (ms, fn) { win.setInterval(fn, ms); } };
	const app = createApp({ bridge: bridge, clock: clock, storage: win.localStorage, onAlert: function (alert) { showAlert(doc, alert); } });
	const dispatch = app.dispatch;

	const nav = navigation(NAV);
	const screensEl = h('main', { class: 'screens' });
	const shell = h('div', { class: 'shell' }, [nav.el, screensEl]);
	const night = h('div', { class: 'night', 'data-tone': 'armed', hidden: true, role: 'button', 'aria-label': 'Wake the screen' }, [icon('shield')]);
	doc.body.appendChild(shell);
	doc.body.appendChild(night);

	const mounted = {};
	SCREENS.forEach(function (screen) {
		const content = h('div', { class: 'screen-content' });
		const scroller = h('div', { class: 'scroller' }, [content]);
		const bar = largeTitle(scroller, screen.title);
		const section = h('section', { class: 'screen', 'data-route': screen.route, hidden: true }, [bar, scroller]);
		screensEl.appendChild(section);
		mounted[screen.route] = { screen: screen, section: section, view: screen.mount(content, dispatch) };
	});

	let shown = null;
	let frame = 0;
	let watching = false;
	let lastTouch = clock.now();
	function show(route) {
		if (shown === route) return;
		if (shown) { mounted[shown].section.hidden = true; mounted[shown].view.hide(); }
		shown = route;
		mounted[route].section.hidden = false;
		shell.setAttribute('data-route', route);
		nav.select(route);
		doc.title = mounted[route].screen.title + ' · SealGuard';
	}

	function render() {
		frame = 0;
		const world = app.world();
		const now = clock.now();
		const appearance = world.config.appearance;
		root.setAttribute('data-theme', appearance === 'auto' ? (world.host && world.host.theme) || 'dark' : appearance);
		if (world.config.reduceMotion) root.setAttribute('data-motion', 'reduce'); else root.removeAttribute('data-motion');
		const route = world.config.onboarded ? world.view.route : 'onboarding';
		show(route);
		mounted[route].view.update(mounted[route].screen.model(world, now));
		const status = sentryStatus(world.sentry, world.config, now);
		nav.status(status.tone, status.title);
		night.setAttribute('data-tone', status.tone);
		watching = status.tone === 'armed' || status.tone === 'recording';
		if (!watching) night.hidden = true;
	}
	app.subscribe(function () { if (!frame) frame = win.requestAnimationFrame(render); });

	function syncRoute() { dispatch({ kind: 'view', patch: { route: routeOf(win.location.hash) } }); }
	win.addEventListener('hashchange', syncRoute);
	win.addEventListener('load', syncRoute);
	syncRoute();

	// The night surface appears only from this tick and leaves only from its own tap, so a tap that wakes the
	// screen can never land on the control that was under the finger.
	function touched() { lastTouch = clock.now(); }
	doc.addEventListener('pointerdown', touched, true);
	doc.addEventListener('touchstart', touched, true);
	doc.addEventListener('keydown', touched, true);
	night.addEventListener('click', function (e) { e.stopPropagation(); touched(); night.hidden = true; });
	clock.every(1000, function () {
		if (watching && night.hidden && clock.now() - lastTouch >= NIGHT_AFTER_MS) night.hidden = false;
	});
}
