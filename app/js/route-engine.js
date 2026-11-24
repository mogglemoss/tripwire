var routeEngine = (function() {
	"use strict";
	// Routes across stargates, the chain's wormholes and EVE-Scout's holes, by
	// the shared route model (docs/route-model.md): every jump costs 1 plus a
	// penalty for the system entered, some holes are left out by preference,
	// and some systems are never passed through. Pure: a graph and preferences
	// in, a route out, so the model's vectors (docs/route-vectors.json) run
	// against it with no page. tripwire.route builds the graph from live data.
	//
	// The model is Aperture's; this is a plain-JS port of Trippy's findRoute
	// (eve-trippy src/chain/route.ts), so the bot and the map give one answer.
	//
	// guidance.js is not replaced: it answers "how far by gate" for the system
	// panel. Its graph is gates only and it cannot see a hole's state.

	var ZARZAKH = 30100000;       // leaving it locks a pilot to their arrival gate for six hours
	var REAL_SYSTEM_MIN = 30000000;
	var SHIP_RANK = {s: 0, m: 1, l: 2, xl: 3};
	var SCOUT_RANK = {small: 0, medium: 1, large: 2, xlarge: 3, capital: 3};
	var SCOUT_EOL_HOURS = 4;
	var DEFAULTS = {mode: "shortest", minShip: null, skipEol: false, skipCrit: false, skipReduced: false, skipNoSig: false, avoid: [], scout: false};

	function withDefaults(prefs) {
		var p = {};
		Object.keys(DEFAULTS).forEach(function(k) { p[k] = prefs && prefs[k] !== undefined && prefs[k] !== null ? prefs[k] : DEFAULTS[k]; });
		if (!SHIP_RANK.hasOwnProperty(p.minShip)) { p.minShip = null; }
		if (p.mode !== "safer" && p.mode !== "less_safe") { p.mode = "shortest"; }
		return p;
	}

	// A mapper's placeholder ("some class 3") or an unknown far side is not a system.
	function isSystem(id) { return typeof id === "number" && id >= REAL_SYSTEM_MIN; }

	// Hole size from the type's largest mass per jump, as the client bands them.
	function sizeForJumpMass(kg) {
		if (kg === null || kg === undefined || !(Number(kg) > 0)) { return null; }
		if (kg <= 5000000) { return "s"; }
		if (kg <= 62000000) { return "m"; }
		if (kg <= 375000000) { return "l"; }
		return "xl";
	}

	// The extra cost of entering a system of this band.
	function penalty(band, mode) {
		if (mode === "safer") { return band === "high" ? 0 : band === "low" ? 50 : 100; }
		if (mode === "less_safe") { return band === "high" ? 50 : 0; }
		return 0;
	}

	// Why a chain hole is left out under these preferences, or null if it is usable.
	function holeBlocked(hole, prefs) {
		if (prefs.skipEol && (hole.life === "eol" || hole.life === "last_hour")) { return "end of life"; }
		if (prefs.skipCrit && hole.mass === "critical") { return "critical mass"; }
		if (prefs.skipReduced && (hole.mass === "reduced" || hole.mass === "critical")) { return "reduced mass"; }
		if (prefs.minShip && SHIP_RANK.hasOwnProperty(hole.size) && SHIP_RANK[hole.size] < SHIP_RANK[prefs.minShip]) { return "too small"; }
		if (prefs.skipNoSig && hole.noSig) { return "no signature"; }
		return null;
	}

	// The same for an EVE-Scout hole: remaining hours and a listed ship size.
	function scoutBlocked(hole, prefs) {
		var hours = hole.remainingHours;
		if (prefs.skipEol && hours !== null && hours !== undefined && hours <= SCOUT_EOL_HOURS) { return "end of life"; }
		var rank = hole.size ? SCOUT_RANK[String(hole.size).toLowerCase()] : undefined;
		if (prefs.minShip && rank !== undefined && rank < SHIP_RANK[prefs.minShip]) { return "too small"; }
		return null;
	}

	// A binary min-heap of [cost, id]; the frontier reaches thousands in k-space.
	function Heap() { this.a = []; }
	Heap.prototype.push = function(cost, id) {
		var a = this.a, i = a.length;
		a.push([cost, id]);
		while (i > 0) {
			var p = (i - 1) >> 1;
			if (a[p][0] <= a[i][0]) { break; }
			var t = a[p]; a[p] = a[i]; a[i] = t;
			i = p;
		}
	};
	Heap.prototype.pop = function() {
		var a = this.a;
		if (!a.length) { return undefined; }
		var top = a[0], last = a.pop();
		if (a.length) {
			a[0] = last;
			for (var i = 0;;) {
				var l = 2 * i + 1, r = l + 1, m = i;
				if (l < a.length && a[l][0] < a[m][0]) { m = l; }
				if (r < a.length && a[r][0] < a[m][0]) { m = r; }
				if (m === i) { break; }
				var t = a[m]; a[m] = a[i]; a[i] = t;
				i = m;
			}
		}
		return top;
	};

	function link(adj, from, to, via, hole) {
		(adj[from] = adj[from] || []).push({to: to, via: via, hole: hole});
	}

	// The graph:
	//   band(id)  -> "high" | "low" | "null"
	//   gates(id) -> ids one open gate away
	//   holes     -> [{a, b, size, life, mass, noSig, ...}], the chain's wormholes
	//   scout     -> [{a, b, size, remainingHours, ...}], EVE-Scout's holes
	//   cost(id)  -> optional extra cost of entering a system, on top of the
	//                model's. Not part of the shared model: it is where a tool
	//                puts its own judgement (recent kills, say).
	//
	// `to` is a system, or a list of them: then the route is to whichever is
	// cheapest to reach, and the result's `to` says which that was.
	//
	// Returns null for no route, else
	//   {from, to, jumps, gates, holes, path: [ids], steps: [{to, via, band, hole}]}
	// with via "gate" | "wh" | "eve_scout", and hole set for the last two.
	function find(graph, from, to, prefs) {
		return search(graph, from, to, prefs, 1)[0] || null;
	}

	// The `count` cheapest to reach of a list of systems, cheapest first: one
	// route each, as find gives. Fewer when fewer can be reached.
	function nearest(graph, from, systems, prefs, count) {
		return search(graph, from, Array.isArray(systems) ? systems : [systems], prefs, Math.max(1, Number(count) || 1));
	}

	function search(graph, from, to, prefs, count) {
		prefs = withDefaults(prefs);
		from = Number(from);
		if (!isSystem(from)) { return []; }

		var avoid = {};
		(prefs.avoid || []).forEach(function(id) { avoid[Number(id)] = true; });
		var never = function(id) { return avoid[id] === true || id === ZARZAKH; };

		// One destination is an end the pilot named, so it is allowed whatever
		// it is. Of several, the ones never passed through are not candidates:
		// "the nearest buyer" should not be the system the pilot said to avoid.
		var several = Array.isArray(to), ends = {}, left = 0;
		(several ? to : [to]).forEach(function(id) {
			id = Number(id);
			if (isSystem(id) && !ends[id] && (!several || id === from || !never(id))) { ends[id] = true; left++; }
		});
		if (!left) { return []; }
		var blocked = function(id) { return id !== from && !ends[id] && never(id); };

		// Holes that pass the preferences, as edges both ways.
		var adj = {};
		(graph.holes || []).forEach(function(h) {
			if (!isSystem(h.a) || !isSystem(h.b) || h.a === h.b || holeBlocked(h, prefs)) { return; }
			link(adj, h.a, h.b, "wh", h); link(adj, h.b, h.a, "wh", h);
		});
		if (prefs.scout) {
			(graph.scout || []).forEach(function(h) {
				if (!isSystem(h.a) || !isSystem(h.b) || h.a === h.b || scoutBlocked(h, prefs)) { return; }
				link(adj, h.a, h.b, "eve_scout", h); link(adj, h.b, h.a, "eve_scout", h);
			});
		}

		var dist = {}, prev = {}, done = {}, frontier = new Heap(), found = [];
		dist[from] = 0;
		frontier.push(0, from);

		while (frontier.a.length) {
			var top = frontier.pop(), d = top[0], sys = top[1];
			if (done[sys]) { continue; }
			done[sys] = true;
			// An end reached is a route found; the search goes on through it
			// for the next, until there are enough or none are left.
			if (ends[sys]) {
				found.push(built(from, sys, prev));
				if (found.length >= count || found.length >= left) { break; }
			}

			var relax = function(next, via, hole) {
				if (!isSystem(next) || done[next] || blocked(next)) { return; }
				var band = graph.band(next);
				var nd = d + 1 + penalty(band, prefs.mode) + (graph.cost ? Math.max(0, Number(graph.cost(next)) || 0) : 0);
				if (dist[next] === undefined || nd < dist[next]) {
					dist[next] = nd;
					prev[next] = {from: sys, to: next, via: via, band: band, hole: hole};
					frontier.push(nd, next);
				}
			};
			(adj[sys] || []).forEach(function(e) { relax(e.to, e.via, e.hole); });
			(graph.gates(sys) || []).forEach(function(next) { relax(Number(next), "gate", null); });
		}

		return found;
	}

	function built(from, to, prev) {
		var steps = [];
		for (var cur = to; cur !== from; cur = prev[cur].from) {
			var p = prev[cur];
			steps.unshift(p.hole ? {to: p.to, via: p.via, band: p.band, hole: p.hole} : {to: p.to, via: p.via, band: p.band});
		}
		return shaped(from, to, steps);
	}

	function shaped(from, to, steps) {
		var gates = steps.filter(function(s) { return s.via === "gate"; }).length;
		return {
			from: from, to: to, jumps: steps.length, gates: gates, holes: steps.length - gates,
			path: [from].concat(steps.map(function(s) { return s.to; })), steps: steps
		};
	}

	// What a route costs, as find counts it.
	function cost(graph, route, prefs) {
		prefs = withDefaults(prefs);
		return route.steps.reduce(function(sum, s) {
			return sum + 1 + penalty(graph.band(s.to), prefs.mode) + (graph.cost ? Math.max(0, Number(graph.cost(s.to)) || 0) : 0);
		}, 0);
	}

	// What is left of a route from one of its systems, with its holes as they
	// are now. Null when that system is not on it, or the rest can no longer
	// be flown: a hole gone or ruled out, a gate closed, a system now avoided.
	function rest(graph, route, at, prefs) {
		prefs = withDefaults(prefs);
		at = Number(at);
		var i = route.path.indexOf(at), avoid = (prefs.avoid || []).map(Number);
		if (i < 0) { return null; }
		var from = at, steps = [];
		for (; i < route.steps.length; i++) {
			var s = route.steps[i], last = i === route.steps.length - 1, hole = null;
			if (!last && (s.to === ZARZAKH || avoid.indexOf(s.to) >= 0)) { return null; }
			if (s.via === "gate") {
				if ((graph.gates(from) || []).map(Number).indexOf(s.to) < 0) { return null; }
			} else {
				if (s.via === "eve_scout" && !prefs.scout) { return null; }
				hole = ((s.via === "wh" ? graph.holes : graph.scout) || []).filter(function(h) { return String(h.id) === String(s.hole.id); })[0];
				var joins = hole && ((hole.a === from && hole.b === s.to) || (hole.b === from && hole.a === s.to));
				if (!joins || (s.via === "wh" ? holeBlocked : scoutBlocked)(hole, prefs)) { return null; }
			}
			steps.push(hole ? {to: s.to, via: s.via, band: graph.band(s.to), hole: hole} : {to: s.to, via: s.via, band: graph.band(s.to)});
			from = s.to;
		}
		return shaped(at, route.to, steps);
	}

	// The route to fly on with: the one already being flown while nothing is
	// cheaper, else the best there is now. Equal routes do not replace each
	// other, so nothing changes under a pilot unless the map did. Null for none.
	function onward(graph, route, at, prefs) {
		var best = find(graph, at, route.to, prefs), kept = rest(graph, route, at, prefs);
		return kept && best && cost(graph, kept, prefs) <= cost(graph, best, prefs) ? kept : best;
	}

	return {
		find: find, nearest: nearest, cost: cost, rest: rest, onward: onward, withDefaults: withDefaults, isSystem: isSystem, sizeForJumpMass: sizeForJumpMass,
		penalty: penalty, holeBlocked: holeBlocked, scoutBlocked: scoutBlocked,
		DEFAULTS: DEFAULTS, ZARZAKH: ZARZAKH
	};
})();
