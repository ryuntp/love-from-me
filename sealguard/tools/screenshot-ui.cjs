#!/usr/bin/env node
// Renders every screen of the UI in headless Chromium at the head unit's resolution, both orientations and both
// themes, and fails on any console error or uncaught exception. Output: build/screens/<route>-<orientation>-<theme>.png
// Usage: tools/screenshot-ui.sh [--routes dashboard,events] [--out build/screens]
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'app/assets/ui/index.html');
const DEFAULT_ROUTES = ['dashboard', 'events', 'cameras', 'car', 'settings', 'diagnostics', 'onboarding'];
const ORIENTATIONS = { landscape: { width: 1920, height: 1080 }, portrait: { width: 1080, height: 1920 } };
const THEMES = ['dark', 'light'];

function arg(name, fallback) {
	const i = process.argv.indexOf(name);
	return i === -1 ? fallback : process.argv[i + 1];
}

function loadPlaywright() {
	try { return require('playwright'); } catch (e) {
		const globalRoot = require('child_process').execSync('npm root -g').toString().trim();
		return require(path.join(globalRoot, 'playwright'));
	}
}

async function main() {
	const routes = arg('--routes', DEFAULT_ROUTES.join(',')).split(',');
	const out = path.resolve(ROOT, arg('--out', 'build/screens'));
	fs.mkdirSync(out, { recursive: true });
	const { chromium } = loadPlaywright();
	const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
	const failures = [];
	for (const [orientation, viewport] of Object.entries(ORIENTATIONS)) {
		for (const theme of THEMES) {
			const context = await browser.newContext({ viewport, colorScheme: theme, reducedMotion: 'reduce', deviceScaleFactor: 1 });
			const page = await context.newPage();
			const errors = [];
			page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
			page.on('pageerror', e => errors.push(String(e)));
			for (const route of routes) {
				await page.goto('file://' + INDEX + '#/' + route, { waitUntil: 'load' });
				await page.waitForTimeout(300);
				const file = path.join(out, `${route}-${orientation}-${theme}.png`);
				await page.screenshot({ path: file, fullPage: false });
				const title = await page.title();
				console.log(`${path.relative(ROOT, file)}  title="${title}"`);
				if (errors.length) {
					failures.push(`${route} ${orientation} ${theme}: ${errors.join(' | ')}`);
					errors.length = 0;
				}
			}
			await context.close();
		}
	}
	await browser.close();
	if (failures.length) {
		console.error('\nconsole errors:\n' + failures.join('\n'));
		process.exit(1);
	}
	console.log(`\n${routes.length * Object.keys(ORIENTATIONS).length * THEMES.length} screenshots in ${path.relative(ROOT, out)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
