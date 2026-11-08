const assert = require('assert');
const { include } = require('./helpers/helpers');

global.tripwire = global.tripwire || {};
include('app/js/tripwire/wormhole-state');

describe('Wormhole life and mass states', function() {
	const S = tripwire.wormholeState;

	it('reads life from the stored value', function() {
		assert.equal(S.lifeState({ life: "stable" }).label, "Stable");
		assert.equal(S.lifeState({ life: "critical" }).label, "EOL");
		assert.equal(S.lifeState({ life: "<1h" }).label, "<1h");
		assert.equal(S.lifeState({ life: "<1h" }).cls, "eol-1h");
		assert.equal(S.lifeState(null).value, "stable");
	});
	it('reads mass in the client wording', function() {
		assert.deepEqual(S.MASS.map(m => m.label), ["Stable", "<50%", "<10%"]);
		assert.equal(S.massState({ mass: "destab" }).cls, "destab");
		assert.equal(S.massState({}).value, "stable");
	});
	it('sends only the life value, no preset hours', function() {
		assert.deepEqual(S.lifeChanges("<1h"), { life: "<1h" });
		assert.deepEqual(S.lifeChanges("nonsense"), { life: "stable" });
		assert.equal(S.presetFor({ life: "critical" }), "critical");
	});
});
