const assert = require('assert');
const { include } = require('./helpers/helpers');

global.tripwire = global.tripwire || {};
if (!global.$) { global.$ = function() {}; }
include('app/js/tripwire/wormhole-state');

describe('Wormhole life and mass, as the client says them', function() {
	const S = tripwire.wormholeState;
	const at = new Date("2026-09-19T12:00:00Z");
	const sig = (lifeLeft) => ({ lifeLeft });
	const critical = { life: "critical" }, stable = { life: "stable" };

	it('reads a critical hole from its expiry', function() {
		assert.equal(S.lifeState(critical, sig("2026-09-19 15:30:00"), at).value, "critical4");
		assert.equal(S.lifeState(critical, sig("2026-09-19 12:40:00"), at).value, "critical1");
		assert.equal(S.lifeState(critical, sig("2026-09-19 11:59:00"), at).value, "expired");
		assert.equal(S.lifeState(critical, null, at).value, "critical4");
	});
	it('reads a stable hole as stable or under a day', function() {
		assert.equal(S.lifeState(stable, sig("2026-09-21 12:00:00"), at).value, "stable");
		assert.equal(S.lifeState(stable, sig("2026-09-20 06:00:00"), at).value, "day");
		assert.equal(S.lifeState(stable, sig("2026-09-19 11:00:00"), at).value, "expired");
		assert.equal(S.lifeState(stable, null, at).value, "stable");
	});
	it('labels and colours follow the ladder', function() {
		assert.deepEqual(S.LIFE.map(p => p.label), ["Stable", "<1d", "<4h", "<1h", "Expired"]);
		assert.deepEqual(S.LIFE.map(p => p.cls), ["stable", "destab", "critical", "critical", "critical"]);
		assert.deepEqual(S.MASS.map(m => m.label), ["Stable", "<50%", "<10%"]);
	});
	it('turns a preset into what the server needs', function() {
		assert.deepEqual(S.lifeChanges("critical1"), { life: "critical", lifeHours: 1 });
		assert.deepEqual(S.lifeChanges("day"), { life: "stable", lifeHours: 24 });
		assert.deepEqual(S.lifeChanges("expired"), { life: "critical", lifeHours: 0 });
		assert.deepEqual(S.lifeChanges("stable"), { life: "stable", lifeHours: -1 });
	});
});
