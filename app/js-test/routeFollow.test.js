// Giving a route to EVE: the waypoints, following one through its wormholes,
// and what must not happen under a pilot who is flying it.
const assert = require('assert');
const { include } = require('./helpers/helpers');

global.tripwire = global.tripwire || {};
include('app/js/route-engine');
include('app/js/tripwire/route');
include('app/js/tripwire/route-follow');

// Short names for system ids: the engine takes only numbers EVE gives systems.
const S = n => 30000000 + n;
// 1 -gate- 2 -gate- 3 ~hole~ 100 (J) ~hole~ 10 -gate- 11 -gate- 12; and the long way round by gates.
function map(change) {
	const gateList = [[1, 2], [2, 3], [10, 11], [11, 12], [3, 20], [20, 21], [21, 22], [22, 23], [23, 24], [24, 25], [25, 10]], gates = {};
	gateList.forEach(p => { const [a, b] = p.map(S); (gates[a] = gates[a] || []).push(b); (gates[b] = gates[b] || []).push(a); });
	const hole = (id, a, b) => ({ id, a: S(a), b: S(b), size: 'l', life: 'stable', mass: 'stable', noSig: false, sigA: 'aaa' + id, sigB: 'bbb' + id });
	const g = { band: () => 'high', gates: id => gates[id] || [], holes: [hole(1, 3, 100), hole(2, 100, 10)], scout: [], by: gates };
	if (change) { change(g); }
	return g;
}
const link = (g, a, b) => { a = S(a); b = S(b); (g.by[a] = g.by[a] || []).push(b); (g.by[b] = g.by[b] || []).push(a); };

function rig(opts) {
	const w = Object.assign({ at: S(1), character: '7', mask: 'm', waiting: false, graph: map(), prefs: {}, calls: [], ended: [], fail: null, hold: null }, opts);
	w.f = tripwire.routeFollow({
		at: () => w.at, character: () => w.character, mask: () => w.mask, waiting: () => w.waiting,
		onward: (f, at) => routeEngine.onward(w.graph, f.route, at, w.prefs),
		send: (ids, who, wanted) => { w.calls.push(ids.map(id => id > S(0) ? id - S(0) : id)); return w.hold ? new Promise(r => { w.release = () => r({ sent: ids.length, of: ids.length, error: null }); w.wanted = wanted; }) : Promise.resolve(w.fail ? { sent: 1, of: ids.length, error: w.fail } : { sent: ids.length, of: ids.length, error: null }); },
		changed: () => {}, ended: (f, why) => w.ended.push(why)
	});
	w.go = async n => { w.at = n && S(n); w.f.step(); await settle(); };
	w.start = async station => { w.f.start({ to: S(12), route: routeEngine.find(w.graph, w.at, S(12), w.prefs), character: '7', mask: 'm', station }); await settle(); };
	return w;
}
const settle = () => new Promise(r => setImmediate(r));

describe('Giving a route to EVE', function() {
	it('sends each system in order, replacing what was there with the first only', async function() {
		const calls = [];
		const r = await tripwire.routeFollow.deliver([5, 6, 7], (id, first) => { calls.push([id, first]); }, () => true);
		assert.deepEqual(calls, [[5, true], [6, false], [7, false]]);
		assert.deepEqual(r, { sent: 3, of: 3, error: null });
	});
	it('waits for each answer before the next call', async function() {
		let open = 0, most = 0;
		await tripwire.routeFollow.deliver([1, 2, 3], () => { open++; most = Math.max(most, open); return settle().then(() => { open--; }); }, () => true);
		assert.equal(most, 1);
	});
	it('stops at a refusal and says how far it got', async function() {
		const calls = [];
		const r = await tripwire.routeFollow.deliver([5, 6, 7], id => { calls.push(id); return id === 6 ? Promise.reject({ status: 502 }) : null; }, () => true);
		assert.deepEqual(calls, [5, 6]);
		assert.deepEqual(r, { sent: 1, of: 3, error: 'ESI 502' });
		const gone = await tripwire.routeFollow.deliver([5], () => { throw new Error('no pilot'); }, () => true);
		assert.equal(gone.error, 'no pilot');
	});
	it('says no more to EVE once it is not wanted', async function() {
		const calls = [];
		await tripwire.routeFollow.deliver([5, 6, 7], id => { calls.push(id); }, () => calls.length < 2);
		assert.deepEqual(calls, [5, 6]);
	});
});

describe('Following a route', function() {
	it('sends the gates to the hole, then the gates after it once the pilot is through', async function() {
		const w = rig();
		await w.start();
		assert.deepEqual(w.calls, [[2, 3]]);
		await w.go(2); await w.go(3);
		assert.equal(w.f.current().state, 'hole');
		await w.go(100);
		assert.equal(w.calls.length, 1, 'nothing between two holes');
		await w.go(10);
		assert.deepEqual(w.calls, [[2, 3], [11, 12]]);
		await w.go(11); await w.go(12);
		assert.deepEqual(w.calls.length, 2);
		assert.deepEqual(w.ended, [null], 'arrived');
		assert.equal(w.f.current(), null);
	});
	it('starts at a wormhole, and sends nothing until through it', async function() {
		const w = rig({ at: S(3) });
		await w.start();
		assert.deepEqual(w.calls, []);
		assert.equal(w.f.current().state, 'hole');
		await w.go(100); await w.go(10);
		assert.deepEqual(w.calls, [[11, 12]]);
	});
	it('ends the last stretch at the station', async function() {
		const w = rig({ at: S(100) });
		await w.start(60001);
		await w.go(10);
		assert.deepEqual(w.calls, [[11, 60001]]);
		await w.go(11);
		assert.equal(w.calls.length, 1);
	});
	it('does not send again for systems skipped between two location reports', async function() {
		const w = rig();
		await w.start();
		await w.go(3); await w.go(10);
		assert.deepEqual(w.calls, [[2, 3], [11, 12]]);
		await w.go(12);
		assert.equal(w.f.current(), null);
	});
	it('does nothing on half a map', async function() {
		// The viewed system changes with the jump, and the signatures are empty
		// until the next sync: planned then, the route is gates all the way.
		const w = rig();
		await w.start();
		const whole = w.graph;
		w.graph = map(g => { g.holes = []; });
		w.waiting = true;
		await w.go(2);
		assert.equal(w.calls.length, 1);
		assert.equal(w.f.current().state, 'gates');
		w.graph = whole; w.waiting = false;
		await w.go(3);
		assert.equal(w.calls.length, 1);
		// The same, not waiting: that is what would have gone to EVE.
		const bad = rig();
		await bad.start();
		bad.graph = map(g => { g.holes = []; });
		await bad.go(2);
		assert.equal(bad.calls.length, 2);
	});
	it('sends the new gates when a hole ahead has gone', async function() {
		const w = rig();
		await w.start();
		w.graph = map(g => { g.holes = g.holes.slice(0, 1); });
		await w.go(2);
		assert.deepEqual(w.calls[1], [3, 20, 21, 22, 23, 24, 25, 10, 11, 12]);
	});
	it('takes a better route that has been mapped, and keeps the old one against an equal one', async function() {
		const w = rig();
		await w.start();
		w.graph = map(g => { link(g, 2, 50); link(g, 50, 51); link(g, 51, 52); link(g, 52, 53); link(g, 53, 12); });   // 2 to 12 in 5 as well
		await w.go(2);
		assert.equal(w.calls.length, 1, 'equal');
		w.graph = map(g => { link(g, 2, 50); link(g, 50, 12); });
		await w.go(2);
		assert.deepEqual(w.calls[1], [50, 12], 'better');
	});
	it('follows a preference changed on the way', async function() {
		const w = rig();
		await w.start();
		w.prefs = { avoid: [S(100)] };
		await w.go(1);
		assert.deepEqual(w.calls[1], [2, 3, 20, 21, 22, 23, 24, 25, 10, 11, 12]);
	});
	it('leaves EVE alone off the route, and picks up again back on it', async function() {
		const w = rig();
		await w.start();
		await w.go(2); await w.go(1);
		assert.equal(w.f.current().state, 'off');
		await w.go(777);
		assert.equal(w.calls.length, 1);
		await w.go(2);
		assert.equal(w.f.current().state, 'gates');
		assert.equal(w.calls.length, 1, 'EVE still has them');
		await w.go(3); await w.go(100); await w.go(10);
		assert.deepEqual(w.calls[1], [11, 12]);
	});
	it('says so when there is no route any more, and goes on when there is', async function() {
		const w = rig({ at: S(3) });
		await w.start();
		const whole = w.graph;
		w.graph = map(g => { g.holes = []; g.by[S(3)] = []; });
		await w.go(3);
		assert.equal(w.f.current().state, 'stuck');
		w.graph = whole;
		await w.go(3);
		assert.equal(w.f.current().state, 'hole');
	});
	it('does not repeat a refused stretch by itself, and tries the next one', async function() {
		const w = rig({ fail: 'ESI 502' });
		await w.start();
		assert.equal(w.f.current().state, 'error');
		await w.go(1); await w.go(2);
		assert.equal(w.calls.length, 1);
		assert.equal(w.f.current().state, 'error');
		w.fail = null;
		await w.go(3); await w.go(100); await w.go(10);
		assert.equal(w.f.current().state, 'gates');
		assert.equal(w.f.current().error, null);
	});
	it('waits with no location, and stops for another pilot or another mask', async function() {
		const w = rig();
		await w.start();
		await w.go(null);
		assert.ok(w.f.current());
		w.character = '8'; await w.go(2);
		assert.deepEqual(w.ended, ['you are tracking another pilot']);
		const m = rig();
		await m.start();
		m.mask = 'other'; await m.go(2);
		assert.deepEqual(m.ended, ['the mask changed']);
	});
	it('drops what is still being sent when it is stopped, started again, or left', async function() {
		for (const then of [w => w.f.stop(''), w => w.f.start({ to: S(12), route: routeEngine.find(w.graph, S(1), S(12), {}), character: '7', mask: 'm' }), w => { w.at = S(777); w.f.step(); }]) {
			const w = rig({ hold: true });
			await w.start();
			const wanted = w.wanted, release = w.release;
			assert.equal(wanted(), true);
			then(w);
			assert.equal(wanted(), false);
			release(); await settle();
			const f = w.f.current();
			assert.ok(!f || f.state !== 'gates', 'its answer changes nothing');
		}
	});
	it('sends the stretch again if the pilot left while it was being sent', async function() {
		const w = rig({ hold: true });
		await w.start();
		await w.go(777); await w.go(1);
		assert.deepEqual(w.calls, [[2, 3], [2, 3]]);
	});
});

describe('The rest of a route', function() {
	const at = (g, id, prefs) => routeEngine.rest(g, routeEngine.find(map(), S(1), S(12), {}), S(id), prefs);
	it('is the route from there, with its holes as they are now', function() {
		const g = map(h => { h.holes[0].life = 'eol'; });
		const r = at(g, 2);
		assert.deepEqual(r.path, [2, 3, 100, 10, 11, 12].map(S));
		assert.equal(r.jumps, 5); assert.equal(r.gates, 3); assert.equal(r.holes, 2);
		assert.equal(r.steps[1].hole.life, 'eol');
		assert.deepEqual(at(g, 12).steps, []);
	});
	it('is none when a hole has gone, is ruled out or moved, a gate closed, or a system is avoided', function() {
		assert.equal(at(map(g => { g.holes.pop(); }), 2), null);
		assert.equal(at(map(g => { g.holes[1].life = 'eol'; }), 2, { skipEol: true }), null);
		assert.equal(at(map(g => { g.holes[1].b = S(11); }), 2), null);
		assert.equal(at(map(g => { g.by[S(11)] = [S(10)]; }), 2), null);
		assert.equal(at(map(), 2, { avoid: [S(100)] }), null);
		assert.equal(at(map(), 777), null);
		assert.ok(at(map(), 2, { avoid: [S(12)] }), 'the end is the pilot\'s own choice');
	});
	it('costs what finding it costs', function() {
		const g = map(h => { h.band = id => id === S(11) ? 'low' : 'high'; });
		const r = routeEngine.find(g, S(10), S(12), { mode: 'safer' });
		assert.equal(routeEngine.cost(g, r, { mode: 'safer' }), 2 + routeEngine.penalty('low', 'safer'));
	});
});

describe('Half a map', function() {
	const was = tripwire.client;
	after(function() { tripwire.client = was; });
	it('is holes without signatures', function() {
		const loading = (wormholes, signatures) => { tripwire.client = { wormholes, signatures }; return tripwire.route.loading(); };
		assert.equal(loading({ 1: {} }, null), true);            // the viewed system just changed
		assert.equal(loading({ 1: {} }, []), true);              // the mask just changed
		assert.equal(loading({ 1: {} }, { 2: {} }), false);
		assert.equal(loading({}, null), false);                   // a mask with nothing on it
		assert.equal(loading(null, null), false);
	});
});
