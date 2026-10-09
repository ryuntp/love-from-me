import { fmt } from '../format.js';
import { assessBattery } from '../battery.js';
import { assessTyres } from '../tyres.js';
import { h, sparkline } from '../ui.js';

/** @typedef {{level: 'good'|'watch'|'act'|'unknown', verdict: string, reason: string}} Finding */
/** @typedef {{battery: Finding, nights: number[], tyres: {wheel: Wheel, kpa: string, trend: string, flagged: boolean}[], tyreFinding: Finding, charge: string}} CarModel */

const WHEELS = ['fl', 'fr', 'rl', 'rr'];
export const WHEEL_NAMES = { fl: 'Front left', fr: 'Front right', rl: 'Rear left', rr: 'Rear right' };
const BATTERY_VERDICTS = {
	learning: { level: 'unknown', verdict: 'Still learning' },
	good: { level: 'good', verdict: 'Healthy' },
	watch: { level: 'watch', verdict: 'Weakening' },
	replace: { level: 'act', verdict: 'Replace soon' },
};

/** Owner-facing finding from a BatteryHealth. @param {BatteryHealth} health @returns {Finding} */
export function batteryFinding(health) {
	const v = BATTERY_VERDICTS[health.verdict] || BATTERY_VERDICTS.learning;
	return { level: v.level, verdict: v.verdict, reason: health.reason };
}

/** Owner-facing finding from a TyreHealth; the plan view and the dashboard tile name the wheel. @param {TyreHealth} health @returns {Finding} */
export function tyreFinding(health) {
	if (health.verdict === 'leak') return { level: 'act', verdict: 'Losing air', reason: health.reason };
	if (health.verdict === 'watch') return { level: 'watch', verdict: 'Losing pressure', reason: health.reason };
	if (health.verdict === 'steady') return { level: 'good', verdict: 'Holding pressure', reason: health.reason };
	return { level: 'unknown', verdict: 'Still learning', reason: health.reason };
}

/** One row per wheel: today's pressure from the latest snapshot, the weekly trend from the assessment, the leak flag. @param {TyreHealth} health @param {VehicleSnapshot|null} latest */
export function tyreRows(health, latest) {
	const trends = health.verdict === 'learning' ? [] : health.tyres;
	return WHEELS.map(function (wheel) {
		const reading = latest && latest.tyres ? latest.tyres[wheel] : null;
		const trend = trends.filter(function (t) { return t.wheel === wheel; })[0];
		return {
			wheel: wheel,
			kpa: reading ? fmt.kpa(reading.kpa) : 'No reading',
			trend: !trend ? 'Trend after a few days' : Math.abs(trend.kpaPerWeek) < 1 ? 'Steady' : (trend.kpaPerWeek > 0 ? '+' : '−') + Math.abs(trend.kpaPerWeek).toFixed(0) + ' kPa a week',
			flagged: Array.isArray(health.wheels) && health.wheels.indexOf(wheel) !== -1,
		};
	});
}

/** The charging line for the latest snapshot. @param {VehicleSnapshot|null} latest */
export function chargeLine(latest) {
	if (!latest) return 'Waiting for the car.';
	const soc = 'Drive battery at ' + fmt.pct(latest.soc);
	const c = latest.charge;
	if (c.state === 'charging') return soc + ', charging at ' + fmt.kw(c.kw) + (c.dc ? ' on a fast charger.' : '.');
	if (c.state === 'plugged') return soc + ', plugged in and waiting.';
	return soc + ', not plugged in.';
}

export const car = {
	route: 'car',
	title: 'Car',
	icon: 'car',

	/** Findings from assessBattery and assessTyres plus the charging line. @param {World} world @param {Millis} now @returns {CarModel} */
	model(world, now) {
		const battery = assessBattery(world.history, now);
		const tyres = assessTyres(world.history, now);
		const latest = world.history.latest;
		return {
			battery: batteryFinding(battery),
			nights: battery.nights.map(function (n) { return n.volts; }),
			tyres: tyreRows(tyres, latest),
			tyreFinding: tyreFinding(tyres),
			charge: chargeLine(latest),
		};
	},

	/** Battery card with sparkline, four-tyre plan view, charging row. @param {HTMLElement} root @param {(i: Intent) => void} dispatch */
	mount(root, dispatch) {
		const batteryVerdict = h('p', { class: 'finding-verdict' });
		const batteryReason = h('p', { class: 'finding-reason' });
		const batteryCard = h('section', { class: 'card', 'data-level': 'unknown' });
		const line = sparkline();
		const nightsCaption = h('p', { class: 'hint' });
		const tyreVerdict = h('p', { class: 'finding-verdict' });
		const tyreReason = h('p', { class: 'finding-reason' });
		const tyreCard = h('section', { class: 'card', 'data-level': 'unknown' });
		const tyreEls = {};
		const plan = h('div', { class: 'tyres' }, WHEELS.map(function (wheel) {
			const kpa = h('span', { class: 'tyre-kpa' });
			const trend = h('span', { class: 'tyre-trend' });
			const el = h('div', { class: 'tyre', 'data-side': wheel.charAt(1) === 'r' ? 'right' : 'left' }, [
				h('span', { class: 'tyre-name' }, [WHEEL_NAMES[wheel]]), kpa, trend, h('span', { class: 'tyre-flag' }, ['Losing air']),
			]);
			tyreEls[wheel] = { el: el, kpa: kpa, trend: trend };
			return el;
		}));
		const charge = h('span', { class: 'row-label' });

		[h('h3', { class: 'card-title' }, ['12V battery']), h('div', { class: 'finding' }, [batteryVerdict, batteryReason]), line.el, nightsCaption]
			.forEach(function (n) { batteryCard.appendChild(n); });
		[h('h3', { class: 'card-title' }, ['Tyres']), h('div', { class: 'finding' }, [tyreVerdict, tyreReason]), plan]
			.forEach(function (n) { tyreCard.appendChild(n); });
		root.appendChild(h('div', { class: 'content' }, [
			h('div', { class: 'car-grid' }, [batteryCard, tyreCard]),
			h('section', { class: 'inset' }, [
				h('h3', { class: 'inset-header' }, ['Charging']),
				h('div', { class: 'inset-rows' }, [h('div', { class: 'row' }, [h('div', { class: 'row-text' }, [charge])])]),
			]),
		]));
		return {
			update(m) {
				batteryCard.setAttribute('data-level', m.battery.level);
				batteryVerdict.textContent = m.battery.verdict;
				batteryReason.textContent = m.battery.reason;
				line.set(m.nights);
				nightsCaption.textContent = m.nights.length ? 'Resting voltage on the last ' + m.nights.length + (m.nights.length === 1 ? ' night' : ' nights') + ', ' + fmt.volts(Math.min.apply(null, m.nights)) + ' to ' + fmt.volts(Math.max.apply(null, m.nights)) + '.' : 'The first reading comes after a full night parked.';
				tyreCard.setAttribute('data-level', m.tyreFinding.level);
				tyreVerdict.textContent = m.tyreFinding.verdict;
				tyreReason.textContent = m.tyreFinding.reason;
				m.tyres.forEach(function (t) {
					const slot = tyreEls[t.wheel];
					slot.kpa.textContent = t.kpa;
					slot.trend.textContent = t.trend;
					slot.el.classList.toggle('flagged', t.flagged);
				});
				charge.textContent = m.charge;
			},
			hide() {},
		};
	},
};
