import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const UI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../app/assets/ui');

function jsFiles(dir) {
	return readdirSync(dir).reduce((out, name) => {
		const full = path.join(dir, name);
		if (statSync(full).isDirectory()) return out.concat(jsFiles(full));
		return name.endsWith('.js') ? out.concat([full]) : out;
	}, []);
}
function stripComments(source) {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}
function stripCssComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }
const FILES = jsFiles(UI);
const CSS_FILES = readdirSync(UI).filter((name) => name.endsWith('.css')).map((name) => path.join(UI, name));
/** The component kit and the screens: every interactive element on the page is built here. */
const KIT = [path.join(UI, 'ui.js')].concat(existsSync(path.join(UI, 'screens')) ? jsFiles(path.join(UI, 'screens')) : []);
const rel = (f) => path.relative(UI, f);
/** The touch target DESIGN.md sets for a car screen touched with a reaching arm. */
const HIT_PX = 72;

/** Forms newer than Chromium 74, or banned by the brief for the same floor. Each is checked on comment-stripped source. */
const BANNED = [
	[/\?\.(?=[A-Za-z_$[(])/, 'optional chaining'],
	[/\?\?/, 'nullish coalescing'],
	[/this\.#/, 'private class field'],
	[/^\s*#[A-Za-z_$][\w$]*\s*[=;(]/m, 'private class field'],
	[/\bimport\s*\(/, 'dynamic import'],
	[/^await\s/m, 'top-level await'],
	[/\.at\(/, 'Array.prototype.at'],
	[/\.replaceAll\(/, 'String.prototype.replaceAll'],
	[/\bstructuredClone\b/, 'structuredClone'],
	[/\bObject\.hasOwn\s*\(/, 'Object.hasOwn'],
	[/\b\d[\d_]*_\d+\b/, 'numeric separator'],
	[/\bglobalThis\b/, 'globalThis'],
	[/\bPromise\.(any|allSettled)\s*\(/, 'Promise.any or allSettled'],
	[/\|\|=|&&=|\?\?=/, 'logical assignment'],
	[/\bstatic\s*\{/, 'class static block'],
];

/** CSS newer than Chromium 74. Properties are matched at the start of a declaration so a prefixed form or a class name of the same spelling passes; functions are matched on a word boundary so minmax() passes. */
const BANNED_CSS = [
	[/(^|[;{])\s*font-optical-sizing\s*:/m, 'font-optical-sizing, Chrome 79'],
	[/(^|[;{])\s*appearance\s*:/m, 'unprefixed appearance, Chrome 84'],
	[/(^|[;{])\s*aspect-ratio\s*:/m, 'aspect-ratio, Chrome 88'],
	[/(^|[;{])\s*inset(-block|-inline)?(-start|-end)?\s*:/m, 'inset, Chrome 87'],
	[/(^|[;{])\s*gap\s*:[^;{}]*;[^{}]*display\s*:\s*(inline-)?flex|display\s*:\s*(inline-)?flex[^{}]*;\s*gap\s*:/m, 'gap on a flex container, Chrome 84'],
	[/:is\(/, ':is(), Chrome 88'],
	[/:where\(/, ':where(), Chrome 88'],
	[/:focus-visible/, ':focus-visible, Chrome 86'],
	[/(?<![\w-])clamp\(/, 'clamp(), Chrome 79'],
	[/(?<![\w-])min\(/, 'min(), Chrome 79'],
	[/(?<![\w-])max\(/, 'max(), Chrome 79'],
	[/(?<![\w-])content-visibility\s*:/, 'content-visibility, Chrome 85'],
	[/@container\b/, 'container queries, Chrome 105'],
	[/@layer\b/, 'cascade layers, Chrome 99'],
];

test('no file under app/assets/ui uses syntax newer than Chromium 74', () => {
	assert.ok(FILES.length >= 10, 'modules present: ' + FILES.length);
	FILES.forEach((file) => {
		const source = stripComments(readFileSync(file, 'utf8'));
		BANNED.forEach(([pattern, name]) => {
			const m = pattern.exec(source);
			if (m) {
				const line = source.slice(0, m.index).split('\n').length;
				assert.fail(rel(file) + ':' + line + ' uses ' + name + ': ' + m[0]);
			}
		});
	});
});

test('no stylesheet under app/assets/ui uses CSS newer than Chromium 74', () => {
	assert.ok(CSS_FILES.length >= 2, 'stylesheets present: ' + CSS_FILES.length);
	CSS_FILES.forEach((file) => {
		const css = stripCssComments(readFileSync(file, 'utf8'));
		BANNED_CSS.forEach(([pattern, name]) => {
			const m = pattern.exec(css);
			if (m) {
				const line = css.slice(0, m.index).split('\n').length;
				assert.fail(rel(file) + ':' + line + ' uses ' + name + ': ' + m[0].trim());
			}
		});
	});
});

test('every file is indented with tabs', () => {
	FILES.forEach((file) => {
		readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
			assert.ok(!/^\t* {2,}/.test(line), rel(file) + ':' + (i + 1) + ' is indented with spaces');
		});
	});
});

function imports(source) {
	const out = [];
	const re = /\bimport\s+[^'"]*?from\s+['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]/g;
	let m;
	while ((m = re.exec(source)) !== null) out.push(m[1] || m[2]);
	return out;
}

test('no logic module imports ui.js, boot.js or a screen', () => {
	const logic = FILES.filter((f) => path.dirname(f) === UI && !['boot.js', 'ui.js'].includes(path.basename(f)));
	assert.ok(logic.length >= 10);
	logic.forEach((file) => {
		imports(stripComments(readFileSync(file, 'utf8'))).forEach((spec) => {
			assert.ok(!/(^|\/)(ui|boot)\.js$/.test(spec) && !/(^|\/)screens\//.test(spec), rel(file) + ' imports ' + spec);
		});
	});
	const sentry = imports(stripComments(readFileSync(path.join(UI, 'sentry.js'), 'utf8')));
	sentry.forEach((spec) => assert.ok(['./config.js', './format.js'].includes(spec), 'sentry.js imports only config.js and format.js, not ' + spec));
});

test('every module but boot.js imports under Node without touching document, window, localStorage or timers', async () => {
	const touched = [];
	const trap = (name) => Object.defineProperty(globalThis, name, { configurable: true, get() { touched.push(name); return undefined; } });
	['document', 'window', 'localStorage', 'sessionStorage', 'navigator'].forEach(trap);
	const timers = {};
	['setTimeout', 'setInterval', 'requestAnimationFrame', 'queueMicrotask'].forEach((name) => {
		timers[name] = globalThis[name];
		globalThis[name] = function () { touched.push(name); return 0; };
	});
	try {
		for (const file of FILES.filter((f) => path.basename(f) !== 'boot.js')) {
			await import(pathToFileURL(file).href);
			assert.deepEqual(touched, [], rel(file) + ' touched ' + touched.join(', ') + ' at import');
		}
	} finally {
		['document', 'window', 'localStorage', 'sessionStorage', 'navigator'].forEach((name) => delete globalThis[name]);
		Object.keys(timers).forEach((name) => { globalThis[name] = timers[name]; });
	}
});

test('tokens.css keeps every text size at 20 px or more', () => {
	const file = path.join(UI, 'tokens.css');
	if (!existsSync(file)) return;
	const css = stripCssComments(readFileSync(file, 'utf8'));
	const sizes = [];
	const re = /(font-size|--(?:font|type)-[\w-]*)\s*:\s*(\d+(?:\.\d+)?)px/g;
	let m;
	while ((m = re.exec(css)) !== null) sizes.push([m[1], Number(m[2])]);
	assert.ok(sizes.length >= 10, 'type scale present: ' + sizes.length);
	sizes.forEach(([name, px]) => assert.ok(px >= 20, name + ' is ' + px + 'px'));
});

test('app.css has no color literal and every font-size is a token', () => {
	const file = path.join(UI, 'app.css');
	if (!existsSync(file)) return;
	const css = stripCssComments(readFileSync(file, 'utf8'));
	const lines = css.split('\n');
	lines.forEach((line, i) => {
		assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(line), 'app.css:' + (i + 1) + ' has a hex color');
		assert.ok(!/\b(rgba?|hsla?)\(/.test(line), 'app.css:' + (i + 1) + ' has a color function');
		const m = /font-size\s*:\s*([^;]+)/.exec(line);
		if (m) assert.ok(/^var\(/.test(m[1].trim()), 'app.css:' + (i + 1) + ' font-size is not a token: ' + m[1]);
	});
});

/** The rules of a stylesheet with @media and @supports wrappers removed, each as its selectors and its declaration text. */
function cssRules(css) {
	const flat = stripCssComments(css).replace(/@(media|supports)[^{]*\{/g, '');
	return flat.split('}').map((chunk) => {
		const i = chunk.lastIndexOf('{');
		if (i < 0) return null;
		return { selectors: chunk.slice(0, i).split(',').map((s) => s.trim()).filter(Boolean), body: chunk.slice(i + 1) };
	}).filter(Boolean);
}
/** The compound a selector finally matches, such as `.icon` in `.tile .icon`; empty for a pseudo-element, which is not a target. */
function target(selector) {
	const last = selector.split(/\s+|>|\+|~/).filter(Boolean).pop() || '';
	return /::|:(before|after)\b/.test(last) ? '' : last;
}
function classesOf(compound) {
	const out = [];
	const re = /\.([A-Za-z_][\w-]*)/g;
	let m;
	while ((m = re.exec(compound)) !== null) out.push(m[1]);
	return out;
}
/** Px tokens from tokens.css, by name. */
function pxTokens() {
	const css = stripCssComments(readFileSync(path.join(UI, 'tokens.css'), 'utf8'));
	const out = {};
	const re = /(--[\w-]+)\s*:\s*(\d+(?:\.\d+)?)px/g;
	let m;
	while ((m = re.exec(css)) !== null) out[m[1]] = Number(m[2]);
	return out;
}
/** Every class the kit or a screen puts beside hit on an element: the interactive classes. A literal counts only when every word in it is shaped like a class, so a sentence that happens to say hit is not one. */
function interactiveClasses() {
	const set = new Set();
	KIT.forEach((file) => {
		const src = stripComments(readFileSync(file, 'utf8'));
		const re = /'([^']*\bhit\b[^']*)'/g;
		let m;
		while ((m = re.exec(src)) !== null) {
			const words = m[1].trim().split(/\s+/);
			if (words.every((c) => /^[a-z][\w-]*$/.test(c))) words.forEach((c) => { if (c !== 'hit') set.add(c); });
		}
	});
	return set;
}
/** The attribute object text of each h(tag, {...}) call for the tag, matched on balanced braces. */
function attrsOf(src, tag) {
	const open = 'h(\'' + tag + '\', {';
	const out = [];
	let i = src.indexOf(open);
	while (i >= 0) {
		let depth = 0;
		let j = i + open.length - 1;
		for (; j < src.length; j++) {
			if (src[j] === '{') depth++;
			else if (src[j] === '}' && --depth === 0) break;
		}
		out.push(src.slice(i + open.length - 1, j + 1));
		i = src.indexOf(open, j);
	}
	return out;
}

test('every interactive class takes its minimum from the hit token and no rule on one shrinks it below the target', () => {
	if (!existsSync(path.join(UI, 'app.css')) || !existsSync(path.join(UI, 'tokens.css'))) return;
	const tokens = pxTokens();
	assert.equal(tokens['--hit'], HIT_PX, 'tokens.css sets --hit to the 72 px target');
	const rules = cssRules(readFileSync(path.join(UI, 'app.css'), 'utf8'));
	const hit = rules.filter((r) => r.selectors.includes('.hit'));
	assert.equal(hit.length, 1, 'one .hit rule');
	assert.match(hit[0].body, /min-width\s*:\s*var\(--hit\)/, '.hit takes its minimum width from the token');
	assert.match(hit[0].body, /min-height\s*:\s*var\(--hit\)/, '.hit takes its minimum height from the token');
	const interactive = interactiveClasses();
	assert.ok(interactive.size >= 6, 'interactive classes found beside hit: ' + Array.from(interactive).join(' '));
	rules.forEach((rule) => {
		rule.selectors.forEach((selector) => {
			const classes = classesOf(target(selector));
			if (!classes.some((c) => interactive.has(c))) return;
			const re = /(^|[;{\s])(min-)?(width|height)\s*:\s*([^;]+)/g;
			let m;
			while ((m = re.exec(rule.body)) !== null) {
				const value = m[4].trim();
				const px = /^(\d+(?:\.\d+)?)px$/.exec(value);
				const token = /^var\((--[\w-]+)\)$/.exec(value);
				const size = px ? Number(px[1]) : token ? tokens[token[1]] : null;
				if (px || token) assert.ok(size !== undefined && size >= HIT_PX, selector + ' sets ' + (m[2] || '') + m[3] + ' to ' + value + ', under the ' + HIT_PX + ' px target');
			}
		});
	});
});

test('every button and link the kit or a screen builds carries the hit class', () => {
	let seen = 0;
	KIT.forEach((file) => {
		const src = stripComments(readFileSync(file, 'utf8'));
		['button', 'a'].forEach((tag) => {
			attrsOf(src, tag).forEach((attrs) => {
				seen++;
				const m = /class:\s*'([^']*)'/.exec(attrs);
				assert.ok(m !== null, rel(file) + ' builds a ' + tag + ' with no class: ' + attrs.slice(0, 60));
				assert.ok(/\bhit\b/.test(m[1]), rel(file) + ' builds a ' + tag + ' without hit: ' + m[1]);
			});
		});
	});
	assert.ok(seen >= 10, 'buttons and links found: ' + seen);
});
