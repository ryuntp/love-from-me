import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from './support.mjs';
import { FIELDS, parseConfig, loadConfig, saveConfig } from '../app/assets/ui/config.js';

const defaults = parseConfig(null);

test('every field has a default that its own spec accepts', () => {
	FIELDS.forEach((f) => {
		assert.equal(parseConfig({ [f.key]: f.spec.fallback })[f.key], f.spec.fallback, f.key);
		assert.equal(defaults[f.key], f.spec.fallback, f.key);
	});
	assert.equal(defaults.v12Floor, 12.4);
	assert.equal(defaults.onboarded, false);
});

test('a bad value falls back alone and leaves its neighbours', () => {
	const c = parseConfig({ arming: 'sometimes', sensitivity: 'high', socFloor: 33, v12Floor: 12.7, lapse: 'yes', retentionDays: 7 });
	assert.equal(c.arming, 'locked');
	assert.equal(c.sensitivity, 'high');
	assert.equal(c.socFloor, 20);
	assert.equal(c.v12Floor, 12.7);
	assert.equal(c.lapse, true);
	assert.equal(c.retentionDays, 7);
});

test('range values must sit on the step and inside the bounds', () => {
	assert.equal(parseConfig({ v12Floor: 13.0 }).v12Floor, 13.0);
	assert.equal(parseConfig({ v12Floor: 13.1 }).v12Floor, 12.4);
	assert.equal(parseConfig({ v12Floor: 12.45 }).v12Floor, 12.4);
	assert.equal(parseConfig({ socFloor: 50 }).socFloor, 50);
	assert.equal(parseConfig({ socFloor: 55 }).socFloor, 20);
	assert.equal(parseConfig({ socFloor: NaN }).socFloor, 20);
});

test('a stored value cut at any byte offset still loads as a valid config', () => {
	const full = JSON.stringify({ ...defaults, socFloor: 35, appearance: 'light' });
	for (let i = 0; i <= full.length; i++) {
		const c = parseConfig(full.slice(0, i));
		FIELDS.forEach((f) => assert.ok(f.key in c, f.key + ' at ' + i));
		assert.ok(c.socFloor === 35 || c.socFloor === 20);
	}
});

test('save then load round trips through one key, and a refusing storage reports false', () => {
	const s = memoryStorage();
	const c = parseConfig({ ...defaults, retentionDays: 30, onboarded: true });
	assert.equal(saveConfig(s, c), true);
	assert.equal(s.length, 1);
	assert.deepEqual(loadConfig(s), c);
	s.refuseWrites = true;
	assert.equal(saveConfig(s, c), false);
	assert.deepEqual(loadConfig(memoryStorage({ 'sealguard.config': '{"junk":' })), defaults);
});
