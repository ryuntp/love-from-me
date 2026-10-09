import { test } from 'node:test';
import assert from 'node:assert/strict';
import './support.mjs';
import { fmt } from '../app/assets/ui/format.js';

test('units carry one decimal for volts and none for percent and pressure', () => {
	assert.equal(fmt.volts(12.37), '12.4 V');
	assert.equal(fmt.pct(62.6), '63%');
	assert.equal(fmt.kpa(239.6), '240 kPa');
	assert.equal(fmt.kw(7.04), '7.0 kW');
	assert.equal(fmt.kw(11.3), '11 kW');
});

test('spans choose seconds, minutes or hours', () => {
	assert.equal(fmt.span(40e3), '40 s');
	assert.equal(fmt.span(35 * 60e3), '35 min');
	assert.equal(fmt.span(2 * 3600e3 + 14 * 60e3), '2 h 14 min');
	assert.equal(fmt.span(3 * 3600e3), '3 h');
});

test('hours stay honest about precision', () => {
	assert.equal(fmt.hours(0.4), 'under an hour');
	assert.equal(fmt.hours(27.4), 'about 27 h');
	assert.equal(fmt.hours(70), 'about 3 days');
});

test('time and day labels use the local zone', () => {
	const now = new Date(2026, 9, 9, 21, 42).getTime();
	assert.equal(fmt.time(now), '21:42');
	assert.equal(fmt.day(now, now), 'Today');
	assert.equal(fmt.day(now - 24 * 3600e3, now), 'Yesterday');
	assert.equal(fmt.day(new Date(2026, 9, 6, 8, 0).getTime(), now), 'Tue 6 Oct');
});

test('a span is rounded as a whole, so it never shows 60 s or 60 min', () => {
	assert.equal(fmt.span(59.6e3), '1 min');
	assert.equal(fmt.span(59.4e3), '59 s');
	assert.equal(fmt.span(59 * 60e3 + 40e3), '1 h');
	assert.equal(fmt.span(3600e3 + 59 * 60e3 + 40e3), '2 h');
	assert.equal(fmt.span(3600e3 + 59 * 60e3 + 20e3), '1 h 59 min');
	assert.equal(fmt.span(-5e3), '0 s');
});

test('volts can carry two decimals for a reading set against a one decimal floor', () => {
	assert.equal(fmt.volts(12.38, 2), '12.38 V');
	assert.equal(fmt.volts(12.38), '12.4 V');
});
