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
const FILES = jsFiles(UI);
const rel = (f) => path.relative(UI, f);

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
	const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
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
	const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
	const lines = css.split('\n');
	lines.forEach((line, i) => {
		assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(line), 'app.css:' + (i + 1) + ' has a hex color');
		assert.ok(!/\b(rgba?|hsla?)\(/.test(line), 'app.css:' + (i + 1) + ' has a color function');
		const m = /font-size\s*:\s*([^;]+)/.exec(line);
		if (m) assert.ok(/^var\(/.test(m[1].trim()), 'app.css:' + (i + 1) + ' font-size is not a token: ' + m[1]);
	});
});
