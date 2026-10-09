// Owner-facing numbers and times. Pure, so screen models and the sentry wording call it; nothing here touches the DOM.
const MINUTE = 60e3;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function pad2(n) { return (n < 10 ? '0' : '') + n; }

export const fmt = {
	volts(v, digits) { return v.toFixed(digits === undefined ? 1 : digits) + ' V'; },
	pct(p) { return Math.round(p) + '%'; },
	kpa(k) { return Math.round(k) + ' kPa'; },
	celsius(c) { return Math.round(c) + '°C'; },
	kw(kw) { return (kw >= 10 ? Math.round(kw) : kw.toFixed(1)) + ' kW'; },
	span(ms) {
		// The whole span is rounded to its unit before it is split, so no part can round up to 60.
		const seconds = Math.max(0, Math.round(ms / 1000));
		if (seconds < 60) return seconds + ' s';
		const minutes = Math.round(ms / MINUTE);
		if (minutes < 60) return minutes + ' min';
		const h = Math.floor(minutes / 60);
		const m = minutes % 60;
		return m === 0 ? h + ' h' : h + ' h ' + m + ' min';
	},
	hours(h) {
		if (h < 1) return 'under an hour';
		if (h < 48) return 'about ' + Math.round(h) + ' h';
		return 'about ' + Math.round(h / 24) + ' days';
	},
	time(at) {
		const d = new Date(at);
		return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
	},
	day(at, now) {
		const d = new Date(at);
		const start = new Date(now);
		start.setHours(0, 0, 0, 0);
		const diff = start.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
		if (diff === 0) return 'Today';
		if (diff === DAY) return 'Yesterday';
		return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
	},
};
