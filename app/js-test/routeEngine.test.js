const assert = require('assert');
const { include, loadJSON } = require('./helpers/helpers');

global.tripwire = global.tripwire || {};
include('public/js/combine');
include('app/js/systemAnalysis');
include('app/js/guidance');
include('app/js/route-engine');
include('app/js/tripwire/route');

const vectors = loadJSON('docs/route-vectors');

// A vector case as a graph for the engine.
function graphOf(c) {
	const gates = {};
	c.gates.forEach(([a, b]) => { (gates[a] = gates[a] || []).push(b); (gates[b] = gates[b] || []).push(a); });
	return {
		band: id => c.systems[id] || 'null',
		gates: id => gates[id] || [],
		holes: c.holes,
		scout: c.scout
	};
}

describe('Route model: the shared vectors (docs/route-vectors.json)', function() {
	it('bands a hole by its largest mass per jump', function() {
		vectors.sizeBands.forEach(([kg, size]) => assert.equal(routeEngine.sizeForJumpMass(kg), size, kg + ' kg'));
		assert.equal(routeEngine.sizeForJumpMass(null), null);
	});

	vectors.cases.forEach(function(c) {
		it(c.name, function() {
			const route = routeEngine.find(graphOf(c), c.from, c.to, c.prefs);
			if (c.expect === null) { return assert.equal(route, null); }
			assert.ok(route, 'a route was expected');
			assert.deepEqual(route.path, c.expect.path);
			assert.deepEqual(route.steps.map(s => s.via), c.expect.via);
			assert.equal(route.jumps, c.expect.path.length - 1, 'jumps is the true hop count');
			assert.equal(route.gates + route.holes, route.jumps);
		});
	});

	it('every case has one best route, so no case depends on how ties break', function() {
		// The same graph with its edges listed in reverse must give the same answer.
		vectors.cases.forEach(function(c) {
			const flipped = Object.assign({}, c, {
				gates: c.gates.slice().reverse().map(([a, b]) => [b, a]),
				holes: c.holes.slice().reverse().map(h => Object.assign({}, h, { a: h.b, b: h.a })),
				scout: c.scout.slice().reverse().map(h => Object.assign({}, h, { a: h.b, b: h.a }))
			});
			const one = routeEngine.find(graphOf(c), c.from, c.to, c.prefs), two = routeEngine.find(graphOf(flipped), c.from, c.to, c.prefs);
			assert.deepEqual(two && two.path, one && one.path, c.name);
		});
	});
});

describe('Route engine: beyond the model', function() {
	const line = { systems: { 30000001: 'high', 30000002: 'high', 30000003: 'high', 30000004: 'high' }, gates: [[30000001, 30000002], [30000002, 30000004], [30000001, 30000003], [30000003, 30000004]], holes: [], scout: [] };

	it('says how each system was reached, and its band', function() {
		const c = { systems: { 30000001: 'high', 31000001: 'null', 30000002: 'low' }, gates: [], scout: [], holes: [{ id: 7, a: 30000001, b: 31000001, life: 'stable', mass: 'stable' }, { id: 8, a: 31000001, b: 30000002, life: 'eol', mass: 'reduced' }] };
		const route = routeEngine.find(graphOf(c), 30000001, 30000002);
		assert.deepEqual(route.steps.map(s => [s.to, s.via, s.band, s.hole.id]), [[31000001, 'wh', 'null', 7], [30000002, 'wh', 'low', 8]]);
		assert.deepEqual([route.jumps, route.holes, route.gates], [2, 2, 0]);
	});
	it('takes a tool\'s own extra cost for a system, on top of the model', function() {
		const g = graphOf(line);
		assert.ok(routeEngine.find(g, 30000001, 30000004));
		g.cost = id => id === 30000002 ? 10 : 0;
		assert.deepEqual(routeEngine.find(g, 30000001, 30000004).path, [30000001, 30000003, 30000004]);
		g.cost = id => id === 30000003 ? 10 : 0;
		assert.deepEqual(routeEngine.find(g, 30000001, 30000004).path, [30000001, 30000002, 30000004]);
	});
	it('reads unknown preferences as the defaults', function() {
		assert.deepEqual(routeEngine.withDefaults({ mode: 'fastest', minShip: 'huge' }), routeEngine.DEFAULTS);
		assert.deepEqual(routeEngine.withDefaults(null), routeEngine.DEFAULTS);
	});
	it('has no route from or to something that is not a system', function() {
		assert.equal(routeEngine.find(graphOf(line), 5, 30000004), null);
		assert.equal(routeEngine.find(graphOf(line), 30000001, null), null);
	});
});

describe('tripwire.route: the live map as a graph', function() {
	const id = name => Number(Object.keys(appData.systems).find(k => appData.systems[k].name === name));
	const JITA = id('Jita'), AMARR = id('Amarr'), DODIXIE = id('Dodixie'), HEK = id('Hek'), THERA = id('Thera');
	const J = Number(Object.keys(appData.systems).find(k => appData.systems[k].class === 3));
	const empty = { signatures: {}, wormholes: {}, scoutLinks: [] };

	beforeEach(function() {
		global.options = { chain: { routeSecurity: 'shortest', routeIgnore: { enabled: false, systems: [] } } };
		guidance.jumpCostModifiers = [];
		guidance.clearCache();
	});

	it('agrees with the gate pathfinder Tripwire already has, jump for jump', function() {
		[[JITA, AMARR], [JITA, DODIXIE], [AMARR, HEK], [DODIXIE, HEK]].forEach(function([a, b]) {
			const old = guidance.findShortestPath(appData.map.shortest, a, b);
			const route = tripwire.route.plan(a, b, {}, empty);
			assert.equal(route.jumps, old.length - 1, appData.systems[a].name + ' to ' + appData.systems[b].name);
			assert.equal(route.gates, route.jumps);
		});
	});
	it('bands systems: high from 0.45, low above 0, null for the rest and for J-space and Pochven', function() {
		assert.equal(tripwire.route.band(JITA), 'high');
		assert.equal(tripwire.route.band(id('Egghelende')), 'low', 'true security just under 0.45');
		assert.equal(tripwire.route.band(id('Tama')), 'low');
		assert.equal(tripwire.route.band(id('1DQ1-A')), 'null');
		assert.equal(tripwire.route.band(J), 'null');
		assert.equal(tripwire.route.band(id('Kuharah')), 'null', 'Pochven');
		assert.equal(tripwire.route.band(39999999), 'null', 'unknown');
	});
	it('uses the chain: two holes beat the gates from Jita to Amarr', function() {
		const source = Object.assign({}, empty, {
			signatures: { 1: { id: 1, systemID: JITA, signatureID: 'abc123' }, 2: { id: 2, systemID: J, signatureID: 'def456' }, 3: { id: 3, systemID: J, signatureID: 'ghi789' }, 4: { id: 4, systemID: AMARR, signatureID: 'jkl012' } },
			wormholes: { 10: { id: 10, initialID: 1, secondaryID: 2, type: 'B274', parent: 'secondary', life: 'stable', mass: 'stable' }, 11: { id: 11, initialID: 3, secondaryID: 4, type: '????', parent: 'initial', life: 'critical', mass: 'destab' } }
		});
		const route = tripwire.route.plan(JITA, AMARR, {}, source);
		assert.deepEqual(route.path, [JITA, J, AMARR]);
		assert.deepEqual(route.steps.map(s => s.via), ['wh', 'wh']);
		assert.deepEqual([route.steps[0].hole.size, route.steps[0].hole.life, route.steps[0].hole.mass, route.steps[0].hole.sigA], ['l', 'stable', 'stable', 'abc123'], 'B274 is a large hole');
		assert.deepEqual([route.steps[1].hole.size, route.steps[1].hole.life, route.steps[1].hole.mass], [null, 'eol', 'reduced'], 'Tripwire critical life is end of life, destab is reduced');

		// The preferences leave the second hole out, so it is back to the gates.
		const gatesOnly = tripwire.route.plan(JITA, AMARR, {}, empty).jumps;
		assert.equal(tripwire.route.plan(JITA, AMARR, { skipEol: true }, source).jumps, gatesOnly);
		assert.equal(tripwire.route.plan(JITA, AMARR, { skipReduced: true }, source).jumps, gatesOnly);
		assert.equal(tripwire.route.plan(JITA, AMARR, { minShip: 'xl' }, source).jumps, gatesOnly, 'a large hole is too small for xl');
		assert.equal(tripwire.route.plan(JITA, AMARR, { minShip: 'l', skipCrit: true }, source).jumps, 2);
	});
	it('reads <1h as the last hour, and leaves out generic far sides and hand-mapped gates', function() {
		const source = Object.assign({}, empty, {
			signatures: { 1: { systemID: JITA }, 2: { systemID: 5 }, 3: { systemID: JITA }, 4: { systemID: AMARR }, 5: { systemID: JITA }, 6: { systemID: AMARR } },
			wormholes: { 10: { id: 10, initialID: 1, secondaryID: 2, type: 'K162', life: 'stable', mass: 'stable' }, 11: { id: 11, initialID: 3, secondaryID: 4, type: 'GATE', life: 'stable', mass: 'stable' }, 12: { id: 12, initialID: 5, secondaryID: 6, type: null, life: '<1h', mass: 'critical' } }
		});
		const holes = tripwire.route.holes(source);
		assert.deepEqual(holes.map(h => h.id), [10, 12], 'the GATE row is not a hole');
		assert.deepEqual([holes[1].life, holes[1].mass, holes[1].size], ['last_hour', 'critical', null]);
		assert.deepEqual(holes.map(h => h.unscanned), [true, true], 'no signature id on either side');
		assert.equal(tripwire.route.plan(JITA, AMARR, {}, source).jumps, 1);
		assert.ok(tripwire.route.plan(JITA, AMARR, { skipEol: true }, source).jumps > 1);
	});
	it('calls a hole unscanned only when neither side has a signature id', function() {
		const source = Object.assign({}, empty, {
			signatures: { 1: { systemID: JITA, signatureID: 'abc123' }, 2: { systemID: J }, 3: { systemID: JITA, signatureID: '???' }, 4: { systemID: AMARR, signatureID: '' } },
			wormholes: { 10: { id: 10, initialID: 1, secondaryID: 2, life: 'stable', mass: 'stable' }, 11: { id: 11, initialID: 3, secondaryID: 4, life: 'stable', mass: 'stable' } }
		});
		assert.deepEqual(tripwire.route.holes(source).map(h => [h.id, h.unscanned, h.sigA, h.sigB]), [[10, false, 'abc123', null], [11, true, null, null]]);
		assert.equal(tripwire.route.plan(JITA, AMARR, {}, source).jumps, 1, 'used by default');
		assert.ok(tripwire.route.plan(JITA, AMARR, { skipUnscanned: true }, source).jumps > 1, 'left out when asked');
	});
	it('does not use a gate the rest of Tripwire treats as closed', function() {
		const open = tripwire.route.plan(JITA, AMARR, {}, empty);
		const a = open.path[0], b = open.path[1];
		guidance.jumpCostModifiers.push((from, to, cost) => (from === a - 30000000 && to === b - 30000000) || (from === b - 30000000 && to === a - 30000000) ? -1 : cost);
		const closed = tripwire.route.plan(JITA, AMARR, {}, empty);
		assert.ok(closed && closed.path[1] !== b, 'the first gate out of Jita is closed, so the route leaves another way');
	});
	it('uses EVE-Scout\'s holes only when asked, in the supplier\'s own shape', function() {
		const links = loadJSON('app/js-test/testdata/eve-scout-sigs-full');
		const holes = tripwire.route.scout({ scoutLinks: links });
		assert.equal(holes.length, links.length);
		assert.ok(holes.every(h => routeEngine.isSystem(h.a) && routeEngine.isSystem(h.b)));
		const fromThera = holes.filter(h => h.a === THERA || h.b === THERA);
		assert.ok(fromThera.length >= 2, 'the fixture has Thera connections');
		const far = h => h.a === THERA ? h.b : h.a, x = far(fromThera[0]), y = far(fromThera[1]);
		const source = Object.assign({}, empty, { scoutLinks: links });
		const without = tripwire.route.plan(x, y, {}, source), withScout = tripwire.route.plan(x, y, { scout: true }, source);
		assert.ok(withScout.jumps <= 2);
		assert.ok(!without || without.steps.every(s => s.via !== 'eve_scout'));
		assert.ok(withScout.jumps < 2 || withScout.steps.every(s => s.via === 'eve_scout'));
	});
	it('carries the two older settings into the preferences', function() {
		const P = (routeSecurity, routeIgnore) => tripwire.route.prefsFromLegacy({ routeSecurity, routeIgnore });
		assert.equal(P('shortest', { enabled: false, systems: ['Tama', 'Rancer'] }).mode, 'shortest');
		assert.deepEqual(P('shortest', { enabled: false, systems: ['Tama', 'Rancer'] }).avoid, [], 'a list that was switched off avoids nothing');
		assert.equal(P('highsec').mode, 'safer');
		assert.equal(P('avoid-null').mode, 'safer');
		assert.equal(P('avoid-high').mode, 'less_safe');
		assert.deepEqual(P('highsec', { enabled: true, systems: ['Tama', ' rancer ', 'Not A System'] }).avoid, [id('Tama'), id('Rancer')]);
		assert.deepEqual(Object.keys(tripwire.route.prefsFromLegacy(undefined)).sort(), Object.keys(routeEngine.DEFAULTS).sort());
	});
	it('sums a route up: systems entered by kind, and the holes worth knowing about', function() {
		const LOW = id('Tama'), source = Object.assign({}, empty, {
			signatures: { 1: { systemID: JITA }, 2: { systemID: J }, 3: { systemID: J, signatureID: 'ghi789' }, 4: { systemID: LOW, signatureID: 'jkl012' } },
			wormholes: { 10: { id: 10, initialID: 1, secondaryID: 2, life: 'stable', mass: 'stable' }, 11: { id: 11, initialID: 3, secondaryID: 4, life: '<1h', mass: 'critical' } }
		});
		const route = tripwire.route.plan(JITA, LOW, {}, source);
		assert.deepEqual(route.path, [JITA, J, LOW]);
		assert.deepEqual(tripwire.route.summary(route, source), { jumps: 2, gates: 0, holes: 2, low: 1, nullsec: 0, jspace: 1, eol: 1, crit: 1, reduced: 0, unscanned: 1, scout: 0 });
		assert.equal(tripwire.route.waypoint(route), null, 'the first jump is a wormhole: nothing for the autopilot');
	});
	it('gives the autopilot the end of the gates a route starts with', function() {
		const gatesOnly = tripwire.route.plan(JITA, AMARR, {}, empty);
		assert.equal(tripwire.route.waypoint(gatesOnly), AMARR, 'all gates: the destination itself');
		// Gates to Perimeter, then a hole from there.
		const PERIMETER = id('Perimeter'), source = Object.assign({}, empty, {
			signatures: { 1: { systemID: PERIMETER, signatureID: 'abc123' }, 2: { systemID: J } },
			wormholes: { 10: { id: 10, initialID: 1, secondaryID: 2, life: 'stable', mass: 'stable' } }
		});
		const route = tripwire.route.plan(JITA, J, {}, source);
		assert.deepEqual(route.steps.map(s => s.via), ['gate', 'wh']);
		assert.equal(tripwire.route.waypoint(route), PERIMETER);
	});
	it('moves the gate pathfinder\'s distances with the same preferences, once the panel has set them', function() {
		const len = () => { guidance.clearCache(); return guidance.findShortestPath(appData.map.shortest, JITA, AMARR).length - 1; };
		const shortest = len();
		options.routes = { prefs: { mode: 'shortest', avoid: [] } };
		assert.equal(len(), shortest);
		options.routes.prefs.mode = 'safer';
		const safer = len();
		assert.ok(safer > shortest, 'the short way to Amarr is through low-sec');
		assert.equal(safer, tripwire.route.plan(JITA, AMARR, { mode: 'safer' }, empty).jumps, 'the same answer as the route engine');
		// The older settings still apply to an account whose panel has never opened.
		delete options.routes;
		options.chain.routeSecurity = 'highsec';
		assert.ok(len() > shortest);
	});
	it('never passes through Zarzakh or an avoided system', function() {
		const all = tripwire.route.plan(JITA, AMARR, {}, empty);
		const mid = all.path[Math.floor(all.path.length / 2)];
		const around = tripwire.route.plan(JITA, AMARR, { avoid: [mid] }, empty);
		assert.ok(around && around.path.indexOf(mid) < 0 && around.jumps >= all.jumps);
		const zarzakh = routeEngine.ZARZAKH;
		assert.equal(appData.systems[zarzakh].name, 'Zarzakh');
		tripwire.route.gates(zarzakh).slice(0, 2).forEach(function(n, i, arr) {
			if (arr.length < 2) { return; }
			const r = tripwire.route.plan(arr[0], arr[1], {}, empty);
			assert.ok(!r || r.path.indexOf(zarzakh) < 0);
		});
	});
});
