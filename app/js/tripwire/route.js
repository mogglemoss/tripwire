// The live map as a graph for routeEngine: the gate map, this mask's chain and
// EVE-Scout's holes, in the shared route model's terms (docs/route-model.md).
//
//   tripwire.route.plan(fromSystemID, toSystemID, prefs) -> route | null
//
// Read-only: it looks at tripwire.client, appData and eveScout.links and
// changes nothing. `source` (last argument) swaps any of those in, for tests.
tripwire.route = (function() {
	"use strict";

	// Tripwire's words for a hole's state -> the model's.
	var LIFE = {"stable": "stable", "critical": "eol", "<1h": "last_hour"};
	var MASS = {"stable": "stable", "destab": "reduced", "critical": "critical"};

	function systems(source) { return (source && source.systems) || appData.systems; }
	function gateMap(source) { return (source && source.map) || (tripwire.map || appData.map).shortest; }

	// high: true security 0.45 and up; low: above 0; null: the rest, with
	// J-space, Pochven and anything unknown.
	function band(systemID, source) {
		var s = systems(source)[systemID];
		if (!s || s.class) { return "null"; }
		var sec = Number(s.security);
		return sec >= 0.45 ? "high" : sec > 0 ? "low" : "null";
	}

	// Systems one open gate away. guidance.connections applies the same
	// modifiers the rest of Tripwire uses, so a closed faction warfare gate is
	// closed here too.
	function gates(systemID, source) {
		return guidance.connections(gateMap(source), systemID)
			.filter(function(c) { return !c.closed; })
			.map(function(c) { return c.systemID; });
	}

	// The chain's wormholes. A "GATE" row is a stargate someone mapped by
	// hand; the gate map already has it. Size comes from the hole's type when
	// Tripwire knows it ("????" and K162-only holes have none, and pass).
	function holes(source) {
		var sigs = (source && source.signatures) || tripwire.client.signatures || {};
		var rows = (source && source.wormholes) || tripwire.client.wormholes || {};
		var types = (source && source.types) || appData.wormholes || {};
		var out = [];
		Object.keys(rows).forEach(function(id) {
			var w = rows[id], a = sigs[w.initialID], b = sigs[w.secondaryID];
			if (!a || !b || w.type === "GATE") { return; }
			var type = types[w.type];
			out.push({
				id: Number(w.id), a: Number(a.systemID), b: Number(b.systemID),
				size: routeEngine.sizeForJumpMass(type ? type.jump : null),
				life: LIFE[w.life] || "stable", mass: MASS[w.mass] || "stable",
				type: w.type || null, parent: w.parent || null,
				sigA: a.signatureID || null, sigB: b.signatureID || null,
				tripwireLife: w.life, tripwireMass: w.mass
			});
		});
		return out;
	}

	// EVE-Scout's public Thera and Turnur connections, as the supplier holds them.
	function scout(source) {
		var links = (source && source.scoutLinks) || (typeof eveScout !== "undefined" && eveScout.links) || [];
		return links.map(function(l) {
			return {
				id: "ES-" + l.id, a: Number(l.out_system_id), b: Number(l.in_system_id),
				size: l.max_ship_size || null,
				remainingHours: l.remaining_hours === undefined ? null : l.remaining_hours,
				type: l.wh_type || null, sigA: l.out_signature || null, sigB: l.in_signature || null
			};
		});
	}

	function graph(source) {
		return {
			band: function(id) { return band(id, source); },
			gates: function(id) { return gates(id, source); },
			holes: holes(source),
			scout: scout(source),
			cost: source && source.cost
		};
	}

	function plan(from, to, prefs, source) {
		return routeEngine.find(graph(source), from, to, prefs);
	}

	return {plan: plan, graph: graph, band: band, gates: gates, holes: holes, scout: scout};
})();
