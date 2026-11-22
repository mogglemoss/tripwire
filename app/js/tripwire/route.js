// The live map as a graph for routeEngine: the gate map, this mask's chain and
// EVE-Scout's holes, in the shared route model's terms (docs/route-model.md).
//
//   tripwire.route.plan(fromSystemID, toSystemID, prefs) -> route | null
//   tripwire.route.nearest(fromSystemID, systemIDs, prefs, count) -> [route]
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

	// A signature id someone recorded: not empty, and not the "???" placeholder.
	function recorded(id) { return !!id && !/^\?+$/.test(String(id)); }

	// The chain's wormholes. A "GATE" row is a stargate someone mapped by
	// hand; the gate map already has it. Size comes from the hole's type when
	// Tripwire knows it ("????" and K162-only holes have none, and pass). A
	// hole with no signature id on either side is "no sig": the auto-mapper
	// drew it from a jump, and nobody has confirmed it.
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
				sigA: recorded(a.signatureID) ? a.signatureID : null, sigB: recorded(b.signatureID) ? b.signatureID : null,
				noSig: !recorded(a.signatureID) && !recorded(b.signatureID),
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

	// The `count` nearest of a list of systems, nearest first.
	function nearest(from, systems, prefs, count, source) {
		return routeEngine.nearest(graph(source), from, systems, prefs, count);
	}

	// The preferences as the two older settings had them (chain.routeSecurity
	// and chain.routeIgnore), for the first time the Routes panel opens.
	function prefsFromLegacy(chain, source) {
		var prefs = routeEngine.withDefaults(null);
		var mode = {"highsec": "safer", "avoid-null": "safer", "avoid-high": "less_safe"}[chain && chain.routeSecurity];
		if (mode) { prefs.mode = mode; }
		var ignore = chain && chain.routeIgnore;
		if (ignore && ignore.enabled && Array.isArray(ignore.systems)) {
			var all = systems(source), byName = {};
			Object.keys(all).forEach(function(id) { byName[String(all[id].name).toLowerCase()] = Number(id); });
			prefs.avoid = ignore.systems.map(function(n) { return byName[String(n).trim().toLowerCase()]; }).filter(Boolean);
		}
		return prefs;
	}

	// A route in numbers: the systems entered by kind, and the holes on it
	// that a pilot should know about before undocking.
	function summary(route, source) {
		var all = systems(source);
		var out = {jumps: route.jumps, gates: route.gates, holes: route.holes, low: 0, nullsec: 0, jspace: 0,
			eol: 0, crit: 0, reduced: 0, noSig: 0, scout: 0};
		route.steps.forEach(function(s) {
			var sys = all[s.to];
			if (sys && sys.class) { out.jspace++; } else if (s.band === "low") { out.low++; } else if (s.band === "null") { out.nullsec++; }
			if (s.via === "eve_scout") { out.scout++; }
			if (s.via !== "wh") { return; }
			if (s.hole.life === "eol" || s.hole.life === "last_hour") { out.eol++; }
			if (s.hole.mass === "critical") { out.crit++; } else if (s.hole.mass === "reduced") { out.reduced++; }
			if (s.hole.noSig) { out.noSig++; }
		});
		return out;
	}

	// Where the in-game autopilot can take the pilot on this route: the end of
	// the gates it starts with (the whole route, when it is all gates). Null
	// when the first jump is a wormhole.
	function waypoint(route) {
		var id = null;
		for (var i = 0; i < route.steps.length && route.steps[i].via === "gate"; i++) { id = route.steps[i].to; }
		return id;
	}

	return {plan: plan, nearest: nearest, graph: graph, band: band, gates: gates, holes: holes, scout: scout,
		prefsFromLegacy: prefsFromLegacy, summary: summary, waypoint: waypoint};
})();
