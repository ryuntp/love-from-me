import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ui = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../app/assets/ui');

test('index.html exists and declares the viewport', () => {
	const html = readFileSync(path.join(ui, 'index.html'), 'utf8');
	assert.match(html, /<meta charset="utf-8">/);
});
