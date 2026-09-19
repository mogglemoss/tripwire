const assert = require('assert');
const { include } = require('./helpers/helpers');

global.tripwire = global.tripwire || {};
if (!global.$) { global.$ = function() {}; }
include('app/js/panel-layout');

describe('Panel layout arithmetic', function() {
	const L = tripwire.panelLayout;
	it('builds the column template from stored weights, defaults where unset', function() {
		assert.equal(L.columnTemplate(['infoWidget', 'signaturesWidget', 'notesWidget'], {}, 180),
			'minmax(180px, 1fr) minmax(180px, 1.35fr) minmax(180px, 0.85fr)');
		assert.equal(L.columnTemplate(['infoWidget', 'signaturesWidget'], { infoWidget: 500, signaturesWidget: 700 }, 180),
			'minmax(180px, 500fr) minmax(180px, 700fr)');
	});
	it('moves a boundary between two columns, never below the minimum', function() {
		assert.deepEqual(L.dragColumns(400, 600, 120, 180), { left: 520, right: 480 });
		assert.deepEqual(L.dragColumns(400, 600, -300, 180), { left: 180, right: 820 });
		assert.deepEqual(L.dragColumns(400, 600, 900, 180), { left: 820, right: 180 });
	});
	it('moves the sized row, and the other way when the chain leads', function() {
		assert.equal(L.dragRow(300, 80, 900, false, 180), 380);
		assert.equal(L.dragRow(300, 80, 900, true, 180), 220);
		assert.equal(L.dragRow(300, -500, 900, false, 180), 180);
		assert.equal(L.dragRow(300, 900, 900, false, 180), 720);
	});
	it('ignores a nudge under the drag threshold', function() {
		assert.equal(L.passedThreshold(3, 0, 4), false);
		assert.equal(L.passedThreshold(0, -4, 4), true);
	});
});
