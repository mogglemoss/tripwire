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
	it('gives a panel with no stored weight its designed share, on the scale of the stored ones', function() {
		// Three columns dragged to pixel weights, then the Routes panel appears.
		assert.equal(L.columnTemplate(['infoWidget', 'signaturesWidget', 'notesWidget', 'routesWidget'], { infoWidget: 400, signaturesWidget: 540, notesWidget: 340 }, 180),
			'minmax(180px, 400fr) minmax(180px, 540fr) minmax(180px, 340fr) minmax(180px, 380fr)');
		assert.equal(L.columnTemplate(['infoWidget', 'routesWidget'], {}, 180), 'minmax(180px, 1fr) minmax(180px, 0.95fr)');
	});
	it('lays out any set of panels from the designed columns, giving ground when the row is narrow', function() {
		assert.equal(L.designTemplate(['infoWidget', 'signaturesWidget', 'notesWidget', 'routesWidget'], 1400),
			'minmax(230px, 1fr) minmax(320px, 1.5fr) minmax(190px, 0.78fr) minmax(230px, 0.95fr)');
		assert.equal(L.designTemplate(['infoWidget', 'signaturesWidget'], 1400), 'minmax(230px, 1fr) minmax(320px, 1.5fr)', 'a hidden panel leaves no column');
		assert.equal(L.designTemplate(['infoWidget', 'signaturesWidget', 'notesWidget', 'routesWidget'], 485),
			'minmax(115px, 1fr) minmax(160px, 1.5fr) minmax(95px, 0.78fr) minmax(115px, 0.95fr)');
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
