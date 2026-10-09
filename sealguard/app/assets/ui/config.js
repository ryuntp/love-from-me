// Settings: the one table behind validation, defaults, persistence and the Settings and Onboarding controls.
// A row is {key, group, label, footer, spec}. group null means the field has no control of its own.
/** @typedef {{kind: 'choice', options: {value: string|number, label: string}[], fallback: string|number}
 *   | {kind: 'range', min: number, max: number, step: number, unit: string, digits: number, fallback: number}
 *   | {kind: 'flag', fallback: boolean}} FieldSpec */
/** @typedef {{key: string, group: string|null, label: string, footer: string, spec: FieldSpec}} Field */
/** @typedef {{arming: 'locked'|'parked'|'manual', sensitivity: 'low'|'medium'|'high', preRollS: number, deterrent: boolean,
 *   socFloor: number, v12Floor: number, retentionDays: number, lapse: boolean,
 *   appearance: 'auto'|'dark'|'light', reduceMotion: boolean, onboarded: boolean}} Config */

const STORAGE_KEY = 'sealguard.config';

function choice(options, fallback) { return { kind: 'choice', options: options, fallback: fallback }; }
function range(min, max, step, unit, digits, fallback) { return { kind: 'range', min: min, max: max, step: step, unit: unit, digits: digits, fallback: fallback }; }
function flag(fallback) { return { kind: 'flag', fallback: fallback }; }
function seconds(values) { return values.map(function (v) { return { value: v, label: v + ' s' }; }); }
function days(values) { return values.map(function (v) { return { value: v, label: v + ' days' }; }); }

/** @type {Field[]} */
export const FIELDS = [
	{ key: 'arming', group: 'Sentry', label: 'Arm sentry', footer: 'When locked arms as soon as you lock the car. When parked arms a minute after power off, locked or not.',
		spec: choice([{ value: 'locked', label: 'When locked' }, { value: 'parked', label: 'When parked' }, { value: 'manual', label: 'Manually' }], 'locked') },
	{ key: 'sensitivity', group: 'Sentry', label: 'Sensitivity', footer: 'Low ignores people walking past. High records anything that moves near the car.',
		spec: choice([{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }], 'medium') },
	{ key: 'preRollS', group: 'Sentry', label: 'Pre-roll', footer: 'Video kept from before the trigger.', spec: choice(seconds([0, 5, 10, 15]), 10) },
	{ key: 'deterrent', group: 'Sentry', label: 'Deterrent flash', footer: 'Flash the lights when a recording starts. Off by default so a parked car does not light the street.', spec: flag(false) },
	{ key: 'socFloor', group: 'Power', label: 'Drive battery floor', footer: 'Sentry stops at this charge so you can still drive home.', spec: range(10, 50, 5, '%', 0, 20) },
	{ key: 'v12Floor', group: 'Power', label: '12V floor', footer: 'Sentry stops when the 12V battery stays under this voltage for 30 seconds.', spec: range(11.8, 13.0, 0.1, 'V', 1, 12.4) },
	{ key: 'retentionDays', group: 'Recording', label: 'Keep events for', footer: 'Older events are deleted to free space.', spec: choice(days([3, 7, 14, 30]), 14) },
	{ key: 'lapse', group: 'Recording', label: 'Parking time-lapse', footer: 'One short clip per parking session, paced by the runtime budget.', spec: flag(true) },
	{ key: 'appearance', group: 'Appearance', label: 'Appearance', footer: 'Auto follows the car display.',
		spec: choice([{ value: 'auto', label: 'Auto' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }], 'auto') },
	{ key: 'reduceMotion', group: 'Appearance', label: 'Reduce motion', footer: 'Turns off transitions and the sheet animation.', spec: flag(false) },
	{ key: 'onboarded', group: null, label: '', footer: '', spec: flag(false) },
];

function accepts(spec, value) {
	if (spec.kind === 'flag') return typeof value === 'boolean';
	if (spec.kind === 'choice') return spec.options.some(function (o) { return o.value === value; });
	if (typeof value !== 'number' || !isFinite(value) || value < spec.min - 1e-9 || value > spec.max + 1e-9) return false;
	const steps = (value - spec.min) / spec.step;
	return Math.abs(steps - Math.round(steps)) < 1e-6;
}

/** Total: any input becomes a valid Config; each missing, off-step or out-of-range field falls back alone. @param {unknown} raw @returns {Config} */
export function parseConfig(raw) {
	let source = raw;
	if (typeof source === 'string') {
		try { source = JSON.parse(source); } catch (e) { source = null; }
	}
	if (source === null || typeof source !== 'object') source = {};
	const config = {};
	FIELDS.forEach(function (f) {
		const value = source[f.key];
		config[f.key] = accepts(f.spec, value) ? value : f.spec.fallback;
	});
	return config;
}

/** @param {{getItem(k: string): string|null}} storage @returns {Config} */
export function loadConfig(storage) {
	let text = null;
	try { text = storage.getItem(STORAGE_KEY); } catch (e) { text = null; }
	return parseConfig(text);
}

/** One setItem of the whole Config, so a crash leaves the old value or the new one and never a mix. @returns {boolean} false when storage refuses */
export function saveConfig(storage, config) {
	try { storage.setItem(STORAGE_KEY, JSON.stringify(config)); return true; } catch (e) { return false; }
}
