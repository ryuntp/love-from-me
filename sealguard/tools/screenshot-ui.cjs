#!/usr/bin/env node
// Renders every screen of the UI, then a set of states the routes alone never reach, in headless Chromium at the head
// unit's resolution, at the 1280 by 720 viewport a density of 1.5 reports, in both orientations and both themes, and fails
// on any console error or uncaught exception. Output: build/screens/<route or state>-<viewport>-<theme>.png
// Usage: tools/screenshot-ui.sh [--routes dashboard,events] [--states halted-dashboard,event-sheet | --states none] [--out build/screens]
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'app/assets/ui/index.html');
const DEFAULT_ROUTES = ['dashboard', 'events', 'cameras', 'car', 'settings', 'diagnostics', 'onboarding'];
const VIEWPORTS = { landscape: { width: 1920, height: 1080 }, portrait: { width: 1080, height: 1920 }, 'landscape-1280': { width: 1280, height: 720 } };
const THEMES = ['dark', 'light'];
const SETTLE_MS = 300;

/** The night surface covers a parked car thirty seconds after the last touch. It appears on the simulator's next second,
 * which is the first real-time tick after an advance, so the runner waits for it; a tap on it reaches the dashboard behind it. */
async function expectNight(page) {
	try {
		await page.waitForSelector('.night:not([hidden])', { timeout: 3000 });
	} catch (e) {
		throw new Error('the night surface is not shown');
	}
}
async function wake(page) {
	await expectNight(page);
	await page.click('.night:not([hidden])');
	await page.waitForTimeout(SETTLE_MS);
}
function click(selector, wait) {
	return async function (page) {
		await page.click(selector);
		await page.waitForTimeout(wait);
	};
}
function go(route) {
	return async function (page) {
		await page.evaluate(function (hash) { window.location.hash = hash; }, '#/' + route);
		await page.waitForTimeout(SETTLE_MS);
	};
}

/**
 * Each state loads one URL and takes its shots in order, each after its own action. advance jumps the simulator's clock
 * before the first frame; the night scenario halts on its 12V floor inside 3900 s and the prowler scenario records at 65 s.
 */
const STATES = [
	{ load: '?scenario=night&advance=3900#/dashboard', shots: [['night-halted', expectNight], ['halted-dashboard', wake]] },
	{ load: '?scenario=prowler&advance=65#/dashboard', shots: [['recording-dashboard', wake]] },
	{ load: '?scenario=leak#/car', shots: [['leak-car', null]] },
	{ load: '?scenario=charging#/dashboard', shots: [['charging-dashboard', null]] },
	{ load: '#/diagnostics', shots: [['kill-waiting', click('.screen[data-route=diagnostics] .switch', 100)], ['killed-diagnostics', async function (page) { await page.waitForTimeout(1500); }], ['killed-dashboard', go('dashboard')]] },
	{ load: '#/events', shots: [['event-sheet', click('.screen[data-route=events] .event-row', 600)], ['delete-confirm', click('.screen[data-route=events] .sheet .button.destructive', 400)]] },
	{ load: '#/onboarding', shots: [['onboarding-2', click('.screen[data-route=onboarding] section.page:not([hidden]) .button.filled', SETTLE_MS)]] },
];

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

/** A fresh context per run: states keep nothing from each other, since the page saves its history to localStorage. */
async function withPage(browser, viewport, theme, run) {
	const context = await browser.newContext({ viewport, colorScheme: theme, reducedMotion: 'reduce', deviceScaleFactor: 1 });
	const page = await context.newPage();
	const errors = [];
	page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
	page.on('pageerror', e => errors.push(String(e)));
	try {
		await run(page, errors);
	} finally {
		await context.close();
	}
}

async function main() {
	const routes = arg('--routes', DEFAULT_ROUTES.join(',')).split(',').filter(Boolean);
	const wanted = arg('--states', 'all');
	const states = wanted === 'none' ? [] : STATES.filter(function (s) { return wanted === 'all' || s.shots.some(function (shot) { return wanted.split(',').indexOf(shot[0]) >= 0; }); });
	const out = path.resolve(ROOT, arg('--out', 'build/screens'));
	fs.mkdirSync(out, { recursive: true });
	const { chromium } = loadPlaywright();
	const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
	const failures = [];
	let count = 0;
	for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
		for (const theme of THEMES) {
			async function shoot(page, errors, name) {
				const file = path.join(out, `${name}-${viewportName}-${theme}.png`);
				await page.screenshot({ path: file, fullPage: false });
				count++;
				console.log(`${path.relative(ROOT, file)}  title="${await page.title()}"`);
				if (errors.length) {
					failures.push(`${name} ${viewportName} ${theme}: ${errors.join(' | ')}`);
					errors.length = 0;
				}
			}
			await withPage(browser, viewport, theme, async function (page, errors) {
				for (const route of routes) {
					await page.goto('file://' + INDEX + '#/' + route, { waitUntil: 'load' });
					await page.waitForTimeout(SETTLE_MS);
					await shoot(page, errors, route);
				}
			});
			for (const state of states) {
				await withPage(browser, viewport, theme, async function (page, errors) {
					await page.goto('file://' + INDEX + state.load, { waitUntil: 'load' });
					await page.waitForTimeout(SETTLE_MS);
					for (const [name, act] of state.shots) {
						try {
							if (act) await act(page);
						} catch (e) {
							failures.push(`${name} ${viewportName} ${theme}: ${String(e.message || e)}`);
						}
						await shoot(page, errors, name);
					}
				});
			}
		}
	}
	await browser.close();
	if (failures.length) {
		console.error('\nconsole errors:\n' + failures.join('\n'));
		process.exit(1);
	}
	console.log(`\n${count} screenshots in ${path.relative(ROOT, out)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
