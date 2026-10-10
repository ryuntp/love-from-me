#!/usr/bin/env node
// Renders docs/manual/manual-th.html to build/manual/SealGuard-manual-th.pdf with headless Chromium.
// Run tools/screenshot-ui.sh first; the manual embeds PNGs from build/screens/.
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'docs/manual/manual-th.html');
const OUT = path.join(ROOT, 'build/manual/SealGuard-manual-th.pdf');

function loadPlaywright() {
	try { return require('playwright'); } catch (e) {
		const globalRoot = require('child_process').execSync('npm root -g').toString().trim();
		return require(path.join(globalRoot, 'playwright'));
	}
}

async function main() {
	fs.mkdirSync(path.dirname(OUT), { recursive: true });
	const { chromium } = loadPlaywright();
	const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
	const page = await browser.newPage();
	const missing = [];
	page.on('requestfailed', r => missing.push(r.url()));
	await page.goto('file://' + SOURCE, { waitUntil: 'networkidle' });
	await page.evaluate(() => document.fonts.ready);
	await page.pdf({
		path: OUT, format: 'A4', printBackground: true, preferCSSPageSize: true,
		displayHeaderFooter: true,
		headerTemplate: '<div></div>',
		footerTemplate: '<div style="width:100%;font-size:8pt;color:#6e6e73;text-align:center;font-family:sans-serif">SealGuard manual · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
	});
	await browser.close();
	if (missing.length) { console.error('missing resources:\n' + missing.join('\n')); process.exit(1); }
	console.log(path.relative(ROOT, OUT));
}
main().catch(e => { console.error(e); process.exit(1); });
