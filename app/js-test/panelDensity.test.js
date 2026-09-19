const assert = require('assert');
const { include } = require('./helpers/helpers');

// Mocha loads every test file before running any; only fill in what is
// missing so the shared globals other suites set up stay intact.
global.tripwire = global.tripwire || {};
if (!global.$) { global.$ = function() {}; }   // the module only registers a ready handler at load
include('app/js/panel-density');

describe('Panel density from panel width', function() {
	const t = { compact: 648, narrow: 500, wrap: 460 };
	it('is full width above the compact threshold', () => assert.deepEqual(tripwire.panelDensity.classify(648, t), []));
	it('compacts just under it', () => assert.deepEqual(tripwire.panelDensity.classify(647, t), ['panel-compact']));
	it('narrows and wraps in turn', () => {
		assert.deepEqual(tripwire.panelDensity.classify(499, t), ['panel-compact', 'panel-narrow']);
		assert.deepEqual(tripwire.panelDensity.classify(459, t), ['panel-compact', 'panel-narrow', 'panel-wrap']);
	});
	it('a panel with no thresholds never compacts', () => assert.deepEqual(tripwire.panelDensity.classify(100, { compact: 0, narrow: 0, wrap: 0 }), []));
	it('reproduces the old viewport switches for the two bars', () => {
		const T = tripwire.panelDensity.thresholds;
		assert.deepEqual(tripwire.panelDensity.classify(647, T.signaturesWidget), ['panel-compact']);   // 1439 wide
		assert.deepEqual(tripwire.panelDensity.classify(648, T.signaturesWidget), []);                   // 1440 wide
		assert.deepEqual(tripwire.panelDensity.classify(431, T.infoWidget), ['panel-compact']);
		assert.deepEqual(tripwire.panelDensity.classify(328, T.infoWidget), ['panel-compact', 'panel-narrow']);  // 1099 wide: range links go
	});
});
