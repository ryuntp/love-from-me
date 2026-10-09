// Owner-facing numbers and times. Pure, so screen models and the sentry wording call it; nothing here touches the DOM.
const MINUTE = 60e3;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function pad2(n) { return (n < 10 ? '0' : '') + n; }

export const fmt = {
	volts(v) { return v.toFixed(1) + ' V'; },
	pct(p) { return Math.round(p) + '%'; },
	kpa(k) { return Math.round(k) + ' kPa'; },
	celsius(c) { return Math.round(c) + '°C'; },
	kw(kw) { return (kw >= 10 ? Math.round(kw) : kw.toFixed(1)) + ' kW'; },
	span(ms) {
		if (ms < MINUTE) return Math.max(0, Math.round(ms / 1000)) + ' s';
		if (ms < HOUR) return Math.round(ms / MINUTE) + ' min';
		const h = Math.floor(ms / HOUR);
		const m = Math.round((ms - h * HOUR) / MINUTE);
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
