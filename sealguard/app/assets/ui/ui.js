// DOM component kit. Nothing here touches the DOM at import; every function builds nodes only when called.
/** @typedef {{el: HTMLElement, set: (value: any) => void}} Control */
/** @typedef {{label: string, detail: string, control: Control|null, onTap: (() => void)|null, href: string|null, tone: string|null}} Row */
/** @typedef {{header: string|Node, footer: string|Node, rows: Row[]}} Section */

const SVG = 'http://www.w3.org/2000/svg';

// 24-unit stroke glyphs. Circles are written as two arcs so one path string carries the whole glyph.
const GLYPHS = {
	shield: 'M12 3l8 3v6c0 4.6-3.3 8.4-8 9-4.7-.6-8-4.4-8-9V6l8-3z',
	film: 'M4 5h16v14H4z M4 9.5h16 M4 14.5h16 M8.5 5v14 M15.5 5v14',
	camera: 'M4 8h3.2l1.8-3h6l1.8 3H20v11H4z M8.5 13a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0',
	car: 'M4 17v-4l2-5h12l2 5v4 M4 17h16 M6 13h12 M6 17.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0 M15 17.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
	gear: 'M8.5 12a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0 M19.5 12H22 M17.3 6.7l1.8-1.8 M12 4.5V2 M6.7 6.7L4.9 4.9 M4.5 12H2 M6.7 17.3l-1.8 1.8 M12 19.5V22 M17.3 17.3l1.8 1.8',
	wrench: 'M20.3 7.2a4.6 4.6 0 0 1-5.9 4.4L6 20a2 2 0 0 1-2.8-2.8l8.4-8.4a4.6 4.6 0 0 1 4.4-5.9l-2.6 2.6 2.4 2.4 2.6-2.6c.2.6.3 1.2.3 1.9',
	grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
	chevron: 'M9 6l6 6-6 6',
	close: 'M6 6l12 12 M18 6L6 18',
	plus: 'M12 5v14 M5 12h14',
	minus: 'M5 12h14',
	check: 'M5 12l5 5L20 7',
	motion: 'M12.25 4.5a1.75 1.75 0 1 0 3.5 0a1.75 1.75 0 1 0-3.5 0 M12.5 8l-2 5.5 3 3V21 M12.5 8l3 3 2.5 1 M12.5 8l-3 2.5-1 3.5 M10.5 13.5L7 20',
	impact: 'M22 12L16.6 10.1 19.1 4.9 13.9 7.4 12 2 10.1 7.4 4.9 4.9 7.4 10.1 2 12 7.4 13.9 4.9 19.1 10.1 16.6 12 22 13.9 16.6 19.1 19.1 16.6 13.9z',
	bolt: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
	warning: 'M12 3l10 18H2z M12 10v4 M12 17.6v.1',
	clock: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M12 7v5l3 2',
	battery: 'M3 8h15v8H3z M18 10.5h2.5v3H18z M6 11v2',
	share: 'M12 3v12 M8 7l4-4 4 4 M5 12v8h14v-8',
	trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
	lock: 'M6 11h12v9H6z M9 11V7.5a3 3 0 0 1 6 0V11',
	power: 'M12 3v8 M6.3 7.5a8 8 0 1 0 11.4 0',
};

function svgEl(tag, attrs, children) {
	const el = document.createElementNS(SVG, tag);
	Object.keys(attrs || {}).forEach(function (name) { el.setAttribute(name, String(attrs[name])); });
	(children || []).forEach(function (child) { el.appendChild(child); });
	return el;
}

/** Element builder; attributes named on-something become listeners, true becomes a bare attribute, null or false is skipped. @param {string} tag @param {Object} attrs @param {(Node|string|null)[]} [children] @returns {HTMLElement} */
export function h(tag, attrs, children) {
	const el = document.createElement(tag);
	Object.keys(attrs || {}).forEach(function (name) {
		const value = attrs[name];
		if (value === null || value === undefined || value === false) return;
		if (name.indexOf('on') === 0 && typeof value === 'function') el.addEventListener(name.slice(2), value);
		else if (value === true) el.setAttribute(name, '');
		else el.setAttribute(name, String(value));
	});
	(children || []).forEach(function (child) {
		if (child === null || child === undefined || child === false) return;
		el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
	});
	return el;
}

/** Inline SVG glyph; an unknown name gives an empty glyph rather than a broken image. @param {string} name @returns {SVGElement} */
export function icon(name) {
	const d = GLYPHS[name] || '';
	return svgEl('svg', { class: 'icon', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
		d ? [svgEl('path', { d: d })] : []);
}

/** Plain links to #/route that CSS lays out as the landscape sidebar or the portrait tab bar; select marks the current one and status feeds the sidebar badge. @param {Screen<any>[]} screens @returns {{el: HTMLElement, select: (route: Route) => void, status: (tone: Tone, title: string) => void}} */
export function navigation(screens) {
	const items = screens.map(function (s) {
		return h('a', { class: 'nav-item hit', href: '#/' + s.route, 'data-route': s.route }, [icon(s.icon), h('span', { class: 'nav-label' }, [s.title])]);
	});
	const badgeText = h('span', { class: 'nav-badge-text' });
	const badge = h('div', { class: 'nav-badge', 'data-tone': 'disarmed' }, [h('span', { class: 'nav-badge-dot' }), badgeText]);
	const el = h('nav', { class: 'nav', 'aria-label': 'Screens' }, [h('div', { class: 'nav-brand' }, ['SealGuard']), h('div', { class: 'nav-items' }, items), badge]);
	return {
		el: el,
		select: function (route) {
			items.forEach(function (a) {
				const on = a.getAttribute('data-route') === route;
				a.classList.toggle('selected', on);
				if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
			});
		},
		status: function (tone, title) {
			badge.setAttribute('data-tone', tone);
			badgeText.textContent = title;
		},
	};
}

/** Navigation bar whose title fades in once the large title's sentinel scrolls under the bar; the large title is inserted at the top of scroller. @param {HTMLElement} scroller @param {string} title @returns {HTMLElement} */
export function largeTitle(scroller, title) {
	const bar = h('header', { class: 'navbar' }, [h('span', { class: 'navbar-title' }, [title])]);
	const sentinel = h('span', { class: 'title-sentinel' });
	const big = h('h1', { class: 'large-title' }, [title, sentinel]);
	scroller.insertBefore(big, scroller.firstChild);
	if (typeof IntersectionObserver === 'function') {
		const observer = new IntersectionObserver(function (entries) {
			bar.classList.toggle('compact', !entries[entries.length - 1].isIntersecting);
		}, { root: scroller });
		observer.observe(sentinel);
	}
	return bar;
}

function rowEl(r) {
	const tappable = Boolean(r.onTap || r.href);
	const tag = r.href ? 'a' : r.onTap ? 'button' : 'div';
	const attrs = { class: 'row' + (tappable ? ' row-tap hit' : ''), 'data-tone': r.tone || null };
	if (r.href) attrs.href = r.href;
	if (r.onTap) attrs.onclick = r.onTap;
	if (tag === 'button') attrs.type = 'button';
	return h(tag, attrs, [
		h('div', { class: 'row-text' }, [h('span', { class: 'row-label' }, [r.label]), r.detail ? h('span', { class: 'row-detail' }, [r.detail]) : null]),
		r.control ? h('div', { class: 'row-control' }, [r.control.el]) : null,
		tappable ? icon('chevron') : null,
	]);
}

/** Grouped inset list: uppercase footnote headers, footnote footers, 84 px rows, separators inset to the text. A header or footer may be a node the caller updates later. @param {Section[]} sections @returns {HTMLElement} */
export function insetList(sections) {
	return h('div', { class: 'content' }, sections.map(function (s) {
		return h('section', { class: 'inset' }, [
			s.header ? h('h3', { class: 'inset-header' }, [s.header]) : null,
			h('div', { class: 'inset-rows' }, s.rows.map(rowEl)),
			s.footer ? h('p', { class: 'inset-footer' }, [s.footer]) : null,
		]);
	}));
}

/** 78 by 48 px switch inside a 72 px hit area; set never fires onChange. @param {(on: boolean) => void} onChange @returns {Control} */
export function toggle(onChange) {
	let on = false;
	const el = h('button', { class: 'switch hit', type: 'button', role: 'switch', 'aria-checked': 'false', onclick: function () { onChange(!on); } },
		[h('span', { class: 'switch-track' }, [h('span', { class: 'switch-knob' })])]);
	return {
		el: el,
		set: function (value) {
			on = Boolean(value);
			el.classList.toggle('on', on);
			el.setAttribute('aria-checked', String(on));
		},
	};
}

/** 60 px pill segmented control in a 72 px hit area. @param {{value: string|number, label: string}[]} options @param {(value: any) => void} onChange @returns {Control} */
export function segmented(options, onChange) {
	const buttons = options.map(function (o) {
		return h('button', { class: 'segment hit', type: 'button', role: 'radio', 'aria-checked': 'false', onclick: function () { onChange(o.value); } }, [o.label]);
	});
	const el = h('div', { class: 'segmented', role: 'radiogroup' }, buttons);
	return {
		el: el,
		set: function (value) {
			buttons.forEach(function (b, i) {
				const on = options[i].value === value;
				b.classList.toggle('selected', on);
				b.setAttribute('aria-checked', String(on));
			});
		},
	};
}

/** Stepper bounded by a range FieldSpec from FIELDS, so it can only emit values parseConfig keeps. @param {FieldSpec} spec @param {(v: number) => string} format @param {(v: number) => void} onChange @returns {Control} */
export function stepper(spec, format, onChange) {
	let value = spec.fallback;
	function snap(v) {
		const clamped = Math.min(spec.max, Math.max(spec.min, v));
		return Number((spec.min + Math.round((clamped - spec.min) / spec.step) * spec.step).toFixed(spec.digits));
	}
	const label = h('span', { class: 'stepper-value' });
	const down = h('button', { class: 'stepper-button hit', type: 'button', 'aria-label': 'Lower', onclick: function () { onChange(snap(value - spec.step)); } }, [icon('minus')]);
	const up = h('button', { class: 'stepper-button hit', type: 'button', 'aria-label': 'Raise', onclick: function () { onChange(snap(value + spec.step)); } }, [icon('plus')]);
	const el = h('div', { class: 'stepper' }, [down, label, up]);
	return {
		el: el,
		set: function (v) {
			value = v;
			label.textContent = format(v);
			down.disabled = v <= spec.min + 1e-9;
			up.disabled = v >= spec.max - 1e-9;
		},
	};
}

/** Bottom sheet in portrait, centered card in landscape; a tap on the scrim calls onClose. @param {() => void} onClose @returns {{el: HTMLElement, open: (content: Node) => void, close: () => void}} */
export function sheet(onClose) {
	const body = h('div', { class: 'sheet-body' });
	const card = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, [h('div', { class: 'sheet-grabber' }), body]);
	const el = h('div', { class: 'sheet-layer', hidden: true, onclick: function (e) { if (e.target === el) onClose(); } }, [card]);
	let open = false;
	return {
		el: el,
		open: function (content) {
			if (body.firstChild !== content) {
				while (body.firstChild) body.removeChild(body.firstChild);
				body.appendChild(content);
			}
			if (open) return;
			open = true;
			el.hidden = false;
			requestAnimationFrame(function () { if (open) el.classList.add('open'); });
		},
		close: function () {
			if (!open) return;
			open = false;
			el.classList.remove('open');
			// Reduced motion zeroes the duration and then transitionend never fires, so a timer finishes the close too.
			const timer = setTimeout(done, 400);
			function done() {
				clearTimeout(timer);
				card.removeEventListener('transitionend', done);
				if (!open) el.hidden = true;
			}
			card.addEventListener('transitionend', done);
		},
	};
}

/** Composite stream or clip, cropped to one quadrant when focused; a video source may carry a poster; hide clears src so the stream stops. @param {'img'|'video'} kind @param {((camera: CameraId|null) => void)|null} onFocus @returns {{el: HTMLElement, set: (source: (Mosaic & {poster?: string})|null, focus: CameraId|null) => void, hide: () => void}} */
export function mosaic(kind, onFocus) {
	const media = h(kind, kind === 'video' ? { class: 'mosaic-media', autoplay: true, loop: true, playsinline: true } : { class: 'mosaic-media', alt: '' });
	if (kind === 'video') media.muted = true;
	let layout = [];
	let focused = null;
	let src = '';
	const el = h('div', { class: 'mosaic mosaic-empty hit', onclick: function (e) {
		if (!onFocus) return;
		if (focused) { onFocus(null); return; }
		const box = el.getBoundingClientRect();
		const col = (e.clientX - box.left) * 2 >= box.width ? 1 : 0;
		const row = (e.clientY - box.top) * 2 >= box.height ? 1 : 0;
		onFocus(layout[col + 2 * row] || null);
	} }, [media]);
	function setSrc(url) {
		if (url === src) return;
		src = url;
		if (url) media.setAttribute('src', url);
		else { media.removeAttribute('src'); if (kind === 'video') media.load(); }
	}
	return {
		el: el,
		set: function (source, focus) {
			layout = source ? source.layout : [];
			setSrc(source ? source.url : '');
			if (kind === 'video') {
				const poster = source && source.poster ? source.poster : '';
				if (poster) media.setAttribute('poster', poster); else media.removeAttribute('poster');
			}
			el.classList.toggle('mosaic-empty', !src);
			const i = focus ? layout.indexOf(focus) : -1;
			focused = i >= 0 ? focus : null;
			if (i >= 0) {
				media.style.transformOrigin = (i % 2) * 100 + '% ' + Math.floor(i / 2) * 100 + '%';
				el.setAttribute('data-focused', focus);
			} else {
				el.removeAttribute('data-focused');
			}
		},
		hide: function () { setSrc(''); },
	};
}

/** Inline SVG line for the nightly 12V trend; set takes the voltages oldest first. The chart spans at least half a volt, so a 10 mV wobble reads as the flat line it is. @returns {Control} */
export function sparkline() {
	const W = 600;
	const H = 120;
	const PAD = 10;
	const MIN_SPAN_V = 0.5;
	const base = svgEl('line', { class: 'sparkline-base', x1: PAD, x2: W - PAD, y1: H - PAD, y2: H - PAD, 'stroke-width': '2', 'vector-effect': 'non-scaling-stroke' });
	const line = svgEl('polyline', { class: 'sparkline-line', fill: 'none', 'stroke-width': '4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' });
	const dot = svgEl('circle', { class: 'sparkline-dot', r: '0' });
	const el = svgEl('svg', { class: 'sparkline', viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true' }, [base, line, dot]);
	return {
		el: el,
		set: function (values) {
			if (!values.length) { line.removeAttribute('points'); dot.setAttribute('r', '0'); return; }
			const lo = Math.min.apply(null, values);
			const hi = Math.max.apply(null, values);
			const span = Math.max(hi - lo, MIN_SPAN_V);
			const top = (hi + lo + span) / 2;
			const points = values.map(function (v, i) {
				const x = values.length === 1 ? W / 2 : PAD + (W - 2 * PAD) * i / (values.length - 1);
				const y = PAD + (H - 2 * PAD) * (top - v) / span;
				return [x, y];
			});
			line.setAttribute('points', points.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '));
			const last = points[points.length - 1];
			dot.setAttribute('cx', last[0].toFixed(1));
			dot.setAttribute('cy', last[1].toFixed(1));
			dot.setAttribute('r', '7');
		},
	};
}

/** Banner in the alert's tone that dismisses itself after six seconds or on tap. @param {Document} doc @param {{tone: Tone, title: string, body: string}} alert */
export function showAlert(doc, alert) {
	let host = doc.querySelector('.alerts');
	if (!host) { host = h('div', { class: 'alerts' }); doc.body.appendChild(host); }
	const el = h('div', { class: 'alert', role: 'status', 'data-tone': alert.tone }, [
		h('span', { class: 'alert-text' }, [h('span', { class: 'alert-title' }, [alert.title]), h('span', { class: 'alert-body' }, [alert.body])]),
	]);
	function remove() { if (el.parentNode) el.parentNode.removeChild(el); }
	el.addEventListener('click', remove);
	host.appendChild(el);
	requestAnimationFrame(function () { el.classList.add('shown'); });
	setTimeout(function () { el.classList.remove('shown'); setTimeout(remove, 400); }, 6000);
}

/** Reconciles parent's children to items by key: creates, moves and updates in place so unchanged rows keep their nodes, and removes every child it did not reuse. @template T @param {HTMLElement} parent @param {T[]} items @param {(item: T) => string} keyOf @param {(item: T) => HTMLElement} create @param {(el: HTMLElement, item: T) => void} update */
export function syncList(parent, items, keyOf, create, update) {
	const pool = new Map();
	for (let child = parent.firstChild; child; child = child.nextSibling) {
		const key = child.getAttribute('data-key');
		if (pool.has(key)) pool.get(key).push(child); else pool.set(key, [child]);
	}
	const kept = new Set();
	let cursor = parent.firstChild;
	items.forEach(function (item) {
		const key = keyOf(item);
		let el = pool.has(key) && pool.get(key).length ? pool.get(key).shift() : null;
		if (el === null) { el = create(item); el.setAttribute('data-key', key); }
		kept.add(el);
		update(el, item);
		if (el === cursor) cursor = cursor.nextSibling;
		else parent.insertBefore(el, cursor);
	});
	// A host that repeats a key once left its first node behind forever; walking the children removes any node not kept.
	for (let child = parent.firstChild, next = null; child; child = next) {
		next = child.nextSibling;
		if (!kept.has(child)) parent.removeChild(child);
	}
}
