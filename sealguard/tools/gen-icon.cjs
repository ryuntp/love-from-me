#!/usr/bin/env node
// Renders app/icon.svg into the launcher PNGs under app/res/mipmap-*/ with headless Chromium.
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const SIZES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

function loadPlaywright() {
	try { return require('playwright'); } catch (e) {
		const globalRoot = require('child_process').execSync('npm root -g').toString().trim();
		return require(path.join(globalRoot, 'playwright'));
	}
}

async function main() {
	const svg = fs.readFileSync(path.join(ROOT, 'app/icon.svg'), 'utf8');
	const { chromium } = loadPlaywright();
	const browser = await chromium.launch();
	for (const [density, size] of Object.entries(SIZES)) {
		const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
		await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('width="192" height="192"', `width="${size}" height="${size}"`)}</body></html>`);
		const dir = path.join(ROOT, 'app/res/mipmap-' + density);
		fs.mkdirSync(dir, { recursive: true });
		await page.screenshot({ path: path.join(dir, 'ic_launcher.png'), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
		await page.close();
		console.log(`mipmap-${density}/ic_launcher.png ${size}px`);
	}
	await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
