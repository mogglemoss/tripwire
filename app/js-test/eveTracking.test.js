const assert = require('assert');
const { include } = require('./helpers/helpers');

global.tripwire = {};
include('app/js/tripwire/eve');

describe('First view follows the tracked pilot', function() {
	const JITA = 30000142, ELSEWHERE = 30000144;

	it('uses the first known tracked location when the user arrived without a system', function() {
		assert.equal(shouldUseTrackedSystemAsInitialView(true, ELSEWHERE, JITA, JITA), true);
	});
	it('waits while the location is not yet known', function() {
		assert.equal(shouldUseTrackedSystemAsInitialView(true, null, JITA, JITA), false);
		assert.equal(shouldUseTrackedSystemAsInitialView(true, undefined, JITA, JITA), false);
	});
	it('does nothing when the user named a system', function() {
		assert.equal(shouldUseTrackedSystemAsInitialView(false, ELSEWHERE, JITA, JITA), false);
	});
	it('does nothing once the user has moved off the bootstrap system', function() {
		assert.equal(shouldUseTrackedSystemAsInitialView(true, ELSEWHERE, 30000001, JITA), false);
	});
});
