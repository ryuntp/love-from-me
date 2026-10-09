// Shared test doubles. Not matched by the *.test.mjs glob.
process.env.TZ = 'Asia/Bangkok';

/** In-memory Storage. refuseWrites makes setItem throw, the way a full or disabled localStorage does. */
export function memoryStorage(seed) {
	const map = new Map(Object.entries(seed || {}));
	const storage = {
		refuseWrites: false,
		getItem(k) { return map.has(k) ? map.get(k) : null; },
		setItem(k, v) { if (storage.refuseWrites) throw new Error('QuotaExceededError'); map.set(k, String(v)); },
		removeItem(k) { map.delete(k); },
		key(i) { return Array.from(map.keys())[i] === undefined ? null : Array.from(map.keys())[i]; },
		get length() { return map.size; },
		dump() { return Object.fromEntries(map); },
	};
	return storage;
}
