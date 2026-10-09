// The DOM-free runtime: loads config and history, connects the host, ticks each second, persists the slices whose reference
// changed, and runs the effects. Inputs that arrive while one is being applied queue up, so no host message can interleave
// two advances. Config is written as soon as it changes. History is written when a kept sample opens a new day, which
// completes the day before it, and otherwise on the tick after it changed, so a burst of samples in one instant costs one
// write per day it touches.
import { loadConfig, saveConfig } from './config.js';
import { loadHistory, saveHistory, dayKey } from './telemetry.js';
import { connectHost } from './host.js';
import { initialWorld, advance } from './main.js';

const TICK_MS = 1000;

function dayRolled(oldKept, newKept) {
	return oldKept.length > 0 && newKept.length > 0 && dayKey(oldKept[oldKept.length - 1].at) !== dayKey(newKept[newKept.length - 1].at);
}

/** DOM-free runtime: loads config and history, connects the host, ticks each second, persists slices whose reference changed, runs effects. @param {AppOptions} opts @returns {App} */
export function createApp(opts) {
	const bridge = opts.bridge;
	const clock = opts.clock;
	const storage = opts.storage;
	const onAlert = opts.onAlert;
	let world = initialWorld(loadConfig(storage), loadHistory(storage, clock.now()));
	const listeners = [];
	const queue = [];
	let draining = false;
	let historyChanged = false;
	let send = null;

	function apply(input) {
		const before = world;
		const result = advance(before, input, clock.now());
		world = result.world;
		if (world.config !== before.config) saveConfig(storage, world.config);
		if (world.history.kept !== before.history.kept) {
			if (dayRolled(before.history.kept, world.history.kept)) saveHistory(storage, before.history);
			historyChanged = true;
		}
		if (historyChanged && input.kind === 'tick') {
			saveHistory(storage, world.history);
			historyChanged = false;
		}
		result.effects.forEach(function (effect) {
			if (effect.kind === 'alert') onAlert(effect);
			else send(effect);
		});
		listeners.forEach(function (fn) { fn(); });
	}
	function dispatch(input) {
		queue.push(input);
		if (draining) return;
		draining = true;
		try {
			while (queue.length) apply(queue.shift());
		} finally {
			draining = false;
		}
	}

	send = connectHost(bridge, dispatch);
	send({ kind: 'hello' });
	clock.every(TICK_MS, function () { dispatch({ kind: 'tick' }); });
	return {
		dispatch: dispatch,
		world: function () { return world; },
		subscribe: function (fn) { listeners.push(fn); },
	};
}
