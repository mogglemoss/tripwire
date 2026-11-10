// Bookmarks pasted from EVE: titles like "ABC-123 B274 EOL" or "C3 SHX 658"
// become signatures and connections.
//
// What EVE itself names is read everywhere: signature ids, wormhole types
// (B274 leads to high-sec), system names and site names. On top of that a
// title uses words, and words are a convention that belongs to a group. The
// default words are the ones Tripwire shows (C2, HS, EOL, <10%); a server's
// brand pack can set its own, and a pilot can keep theirs in Settings.
// (The importer started in squizzlabs/tripwire, read by his corp's words.)
//
// A title that names no signature, like a bare chain name "A31", is left
// alone: nothing in it says which connection it is.
tripwire.bookmarks = (function() {
	"use strict";

	var DEFAULT = {
		name: "Tripwire's own words",
		destinations: {
			"High-Sec": ["HS"], "Low-Sec": ["LS"], "Null-Sec": ["NS"],
			"Class-1": ["C1"], "Class-2": ["C2"], "Class-3": ["C3"], "Class-4": ["C4"], "Class-5": ["C5"], "Class-6": ["C6"],
			"Class-13": ["C13"], "Drifter": ["DRIFTER"], "Triglavian": ["POCHVEN"], "wormhole": []
		},
		factions: {"Caldari": [], "Minmatar": [], "Gallente": [], "Amarr": []},
		life: {"critical": ["EOL"], "<1h": ["<1H"]},
		mass: {"destab": ["<50%"], "critical": ["<10%"]},
		sites: {"Gas": [], "Data": [], "Relic": [], "Combat": [], "Ore": [], "auto": []},
		unknownSignature: [],
		unknownSystem: [],
		home: ["*"],
		camps: []
	};

	// Every meaning a word can have, in the order Settings lists them.
	var MEANINGS = [
		["Where a hole leads", [["destinations.High-Sec", "High-sec"], ["destinations.Low-Sec", "Low-sec"], ["destinations.Null-Sec", "Null-sec"],
			["destinations.Class-1", "Class 1"], ["destinations.Class-2", "Class 2"], ["destinations.Class-3", "Class 3"], ["destinations.Class-4", "Class 4"],
			["destinations.Class-5", "Class 5"], ["destinations.Class-6", "Class 6"], ["destinations.Class-13", "Class 13"], ["destinations.Drifter", "Drifter"],
			["destinations.Triglavian", "Pochven"], ["destinations.wormhole", "Any wormhole"]]],
		["Faction space", [["factions.Caldari", "Caldari"], ["factions.Minmatar", "Minmatar"], ["factions.Gallente", "Gallente"], ["factions.Amarr", "Amarr"]]],
		["Life and mass", [["life.critical", "End of life"], ["life.<1h", "Under an hour"], ["mass.destab", "Mass under 50%"], ["mass.critical", "Mass under 10%"]]],
		["Sites", [["sites.Gas", "Gas site"], ["sites.Data", "Data site"], ["sites.Relic", "Relic site"], ["sites.Combat", "Combat site"], ["sites.Ore", "Ore site"], ["sites.auto", "A site, read its name"]]],
		["Other", [["unknownSignature", "Unscanned"], ["unknownSystem", "Unknown system"], ["home", "Way home"], ["camps", "Camped"]]]
	];

	var FACTION_IDS = {"Caldari": 500001, "Minmatar": 500002, "Amarr": 500003, "Gallente": 500004};
	var LIFE_ORDER = ["stable", "critical", "<1h"], MASS_ORDER = ["stable", "destab", "critical"];

	function clone(o) { return JSON.parse(JSON.stringify(o)); }
	function up(s) { return String(s || "").toUpperCase().trim(); }
	function list(v) { return (Array.isArray(v) ? v : String(v || "").split(/[,\s]+/)).map(up).filter(Boolean); }

	// Over the default: a meaning the override names replaces that meaning's
	// words outright (a pack listing "CRIT" for mass under 10% means only that).
	function merge(base, over) {
		var out = clone(base);
		Object.keys(over || {}).forEach(function(k) {
			var v = over[k];
			if (v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" && !Array.isArray(out[k])) {
				Object.keys(v).forEach(function(m) { out[k][m] = Array.isArray(v[m]) ? list(v[m]) : v[m]; });
			} else { out[k] = Array.isArray(v) ? list(v) : v; }
		});
		return out;
	}

	// A convention as rows of word -> meaning, and back: what Settings edits.
	function get(conv, key) { var p = key.split("."); return p.length > 1 ? ((conv[p[0]] || {})[p[1]] || []) : (conv[p[0]] || []); }
	function toRows(conv) {
		var rows = [];
		MEANINGS.forEach(function(g) { g[1].forEach(function(m) { list(get(conv, m[0])).forEach(function(w) { rows.push({word: w, meaning: m[0]}); }); }); });
		return rows;
	}
	function fromRows(rows) {
		var conv = clone(DEFAULT);
		MEANINGS.forEach(function(g) { g[1].forEach(function(m) { var p = m[0].split("."); if (p.length > 1) { conv[p[0]][p[1]] = []; } else { conv[p[0]] = []; } }); });
		delete conv.name;
		(rows || []).forEach(function(r) {
			var w = up(r.word), p = String(r.meaning || "").split(".");
			if (!w || !r.meaning) { return; }
			var at = p.length > 1 ? conv[p[0]] && conv[p[0]][p[1]] : conv[p[0]];
			if (at && at.indexOf(w) < 0) { at.push(w); }
		});
		return conv;
	}
	function meaningLabel(key) {
		var out = key;
		MEANINGS.forEach(function(g) { g[1].forEach(function(m) { if (m[0] === key) { out = m[1]; } }); });
		return out;
	}

	// word -> meaning, for one section
	function lookup(section) {
		var map = {};
		Object.keys(section || {}).forEach(function(meaning) { list(section[meaning]).forEach(function(w) { map[w] = meaning; }); });
		return map;
	}

	// System names, upper-cased, once per systems table.
	var namesFor = null, names = null;
	function systemNames(systems) {
		if (namesFor !== systems) {
			names = {};
			Object.keys(systems || {}).forEach(function(id) { if (systems[id] && systems[id].name) { names[up(systems[id].name)] = Number(id); } });
			namesFor = systems;
		}
		return names;
	}

	// The convention, ready to read with. EVE's own names come from appData
	// unless they are given.
	function compile(conv, data) {
		data = data || (typeof appData !== "undefined" ? appData : {});
		return {
			conv: conv,
			destinations: lookup(conv.destinations), factions: lookup(conv.factions),
			life: lookup(conv.life), mass: lookup(conv.mass), sites: lookup(conv.sites),
			unknownSignature: list(conv.unknownSignature), unknownSystem: list(conv.unknownSystem),
			home: list(conv.home), camps: list(conv.camps),
			wormholes: data.wormholes || {}, systemNames: systemNames(data.systems)
		};
	}

	// The convention in force: the pilot's own, else the server's, else the default.
	function convention(serverConv, pilot) {
		if (pilot && pilot.own && pilot.convention) { return merge(DEFAULT, pilot.convention); }
		return merge(DEFAULT, serverConv || {});
	}

	// Site names that say their own type. References: EVE University's lists
	// of data, relic and wormhole sites. Exact names where a prefix could mislead.
	var COMBAT = ["Rampant Drone Fabricator", "Besieged Covert Research Facility", "Perimeter Ambush Point", "Perimeter Camp",
		"Phase Catalyst Node", "The Line", "Perimeter Checkpoint", "Perimeter Hangar", "The Ruins of Enclave Cohort 27",
		"Sleeper Data Sanctuary", "Fortification Frontier Stronghold", "Outpost Frontier Stronghold", "Solar Cell",
		"The Oruze Construct", "Frontier Barracks", "Frontier Command Post", "Integrated Terminus", "Sleeper Information Sanctum",
		"Core Garrison", "Core Stronghold", "Oruze Osobnyk", "Quarantine Area", "Core Citadel", "Core Bastion",
		"Strange Energy Readings", "The Mirror"].map(function(n) { return n.toLowerCase(); });
	function siteType(name) {
		var n = String(name || "").trim().replace(/\s+/g, " ");
		if (COMBAT.indexOf(n.toLowerCase()) >= 0) { return "Combat"; }
		if (/^(Limited|Standard|Superior) Sleeper Cache$/i.test(n)) { return "Data"; }
		if (/^(?:(Common|Ordinary) Perimeter|(Average|Unexceptional) Frontier|(Exceptional|Infrequent|Isolated|Rarified|Uncommon|Unusual) Core) Deposit$/i.test(n)) { return "Ore"; }
		if (/^Unsecured(?: |$)/i.test(n) || /^(Local|Regional|Central) (Angel|Blood|Guristas|Sansha|Serpentis) .+/i.test(n)) { return "Data"; }
		if (/^Forgotten(?: |$)/i.test(n) || /^(Crumbling|Decayed|Ruined) (Angel|Blood|Guristas|Sansha|Serpentis) .+/i.test(n)) { return "Relic"; }
		if (/^(?:(?:Barren|Minor|Ordinary|Sizeable|Sizable|Token) Perimeter|(?:Bountiful|Vast) Frontier|(?:Instrumental|Vital) Core) Reservoir$/i.test(n)) { return "Gas"; }
		return null;
	}

	var FULL_ID = /^([A-Z]{3})-?(\d{3})$/i, SHORT_ID = /^[A-Z]{3}$/, UNKNOWN = /^\?{3}$/;

	// The kind of system a wormhole type leads to, or the system itself.
	function wormholeLeads(code, c) {
		var w = c.wormholes[code];
		if (!w || !w.leadsTo) { return null; }
		if (/^(Class-\d+|High-Sec|Low-Sec|Null-Sec|Triglavian|Drifter)$/.test(w.leadsTo)) { return {destination: w.leadsTo}; }
		var id = c.systemNames[up(w.leadsTo)];
		return id ? {system: id} : null;
	}

	// One pasted row -> a bookmark, or null when the row is not one. Only the
	// title (before the first tab) is read; folder and date are ignored. Words
	// can come in any order.
	function parse(row, c) {
		var title = String(row || "").split("\t")[0].replace(/&(?:lt|#0*60|#x0*3c);/ig, "<").trim();
		if (!title) { return null; }
		var words = title.split(/\s+/), marks = [];
		var full = -1, short = -1, unknownAt = -1, site = null, siteAt = -1, destination = null, system = null, hole = false, life, mass, camp = false;

		words.forEach(function(raw, i) {
			var W = up(raw);
			// The home marker ("*") can sit on its own or stuck to a word.
			c.home.forEach(function(h) { if (h.length === 1) { W = W.split(h).join(""); } });
			var mark = "other";
			if (!W || c.home.indexOf(W) >= 0) { mark = "skip"; }
			else if (FULL_ID.test(W)) { mark = "id"; if (full < 0) { full = i; } }
			else if (c.life[W]) { mark = "skip"; hole = true; life = stricter(LIFE_ORDER, life, c.life[W]); }
			else if (c.mass[W]) { mark = "skip"; hole = true; mass = stricter(MASS_ORDER, mass, c.mass[W]); }
			else if (c.destinations[W]) { mark = "skip"; hole = true; destination = destination || c.destinations[W]; }
			else if (c.sites[W] && siteAt < 0) { mark = "skip"; site = c.sites[W]; siteAt = i; }
			else if (W === "K162") { mark = "skip"; hole = true; }
			else if (wormholeLeads(W, c)) { mark = "skip"; hole = true; var l = wormholeLeads(W, c); destination = destination || l.destination || null; system = system || l.system || null; }
			else if (UNKNOWN.test(W) || c.unknownSignature.indexOf(W) >= 0 || c.unknownSystem.indexOf(W) >= 0) { mark = "unknown"; if (unknownAt < 0) { unknownAt = i; } }
			else if (c.camps.indexOf(W) >= 0 || /^-+\*?-+$/.test(W)) { mark = "skip"; camp = true; }
			else if (SHORT_ID.test(raw) && short < 0) { mark = "short"; short = i; }   // as typed: EVE ids are capitals
			marks.push({raw: raw, W: W, mark: mark});
		});

		// The signature: a full id, else three capitals, else an unknown marker
		// that comes before anything else ("??? C3"), else none.
		var sigAt = full >= 0 ? full : short;
		var id = sigAt >= 0 ? (FULL_ID.exec(marks[sigAt].W) ? [FULL_ID.exec(marks[sigAt].W)[1], FULL_ID.exec(marks[sigAt].W)[2]] : [marks[sigAt].W, ""]) : null;
		if (!id && unknownAt >= 0 && (hole || site)) { id = ["???", ""]; marks[unknownAt].mark = "skip"; }
		if (!id) { return null; }
		var others = marks.filter(function(m, i) { return i !== sigAt && (m.mark === "other" || (m.mark === "short")); });
		var text = others.map(function(m) { return m.raw; }).join(" ");
		var out = {bookmark: true, id: id};

		// A site: a site word with nothing saying it is a hole.
		if (site && !hole) {
			out.type = site === "auto" ? (siteType(text) || "Unknown") : site;
			if (text && !camp) { out.name = text; }
			return out;
		}

		if (!hole && !site && c.systemNames[up(text)]) {
			hole = true;   // "ABC-123 Thera": where it goes is all it says
		}

		if (!hole) {
			// A full id and anything else: the signature, named. A site name
			// says its type; anything else (a chain name, "A31") stays a name.
			if (full < 0 || !text) { return null; }
			out.type = siteType(text) || "Unknown";
			out.name = text;
			return out;
		}

		out.type = "Wormhole";
		if (destination) { out.destination = destination; }
		if (system) { out.system = system; }
		var hint = others.map(function(m) { return m.W; }).filter(function(W) {
			if (!/^[A-Z0-9-]+$/.test(W)) { return false; }   // "<4H" in words this server does not use is no place name
			var id = c.systemNames[W];
			if (id && !out.system) { out.system = id; return false; }
			return true;
		});
		if (out.system && !out.destination) { out.destination = typeOf(out.system, c); }
		if (life) { out.life = life; }
		if (mass) { out.mass = mass; }
		if (hint.length) { out.hint = hint.join(" "); }
		return out;
	}

	// The kind of system an id is, in the destination words' terms.
	function typeOf(id, c) {
		var s = (typeof appData !== "undefined" && appData.systems) ? appData.systems[id] : null;
		if (!s) { return undefined; }
		var cls = Number(s.class);
		if (cls >= 14 && cls <= 18) { return "Drifter"; }
		if (cls) { return "Class-" + cls; }
		if (Number(s.factionID) === 500026) { return "Triglavian"; }
		var sec = Number(s.security);
		return sec >= 0.45 ? "High-Sec" : sec > 0 ? "Low-Sec" : "Null-Sec";
	}

	function stricter(order, a, b) {
		if (!a) { return b; }
		if (!b) { return a; }
		return order.indexOf(b) > order.indexOf(a) ? b : a;
	}

	// ── destinations ──────────────────────────────────────────────────────
	// Empire space for a system: its faction, or for CONCORD-held systems the
	// faction that holds most of its region.
	var regionFactions = null;
	function spaceFaction(system, systems) {
		var f = Number(system && system.factionID);
		if (f !== 500006 || !systems) { return f; }
		if (!regionFactions) {
			regionFactions = {};
			Object.keys(systems).forEach(function(id) {
				var s = systems[id], sf = Number(s.factionID);
				if (sf < 500001 || sf > 500004) { return; }
				var r = regionFactions[s.regionID] || (regionFactions[s.regionID] = {});
				r[sf] = (r[sf] || 0) + 1;
			});
		}
		var r = regionFactions[system.regionID] || {}, ranked = Object.keys(r).sort(function(a, b) { return r[b] - r[a]; });
		return ranked.length && (!ranked[1] || r[ranked[0]] > r[ranked[1]]) ? Number(ranked[0]) : f;
	}

	function isType(destination, system) {
		if (!destination) { return true; }
		var cls = Number(system && system.class);
		if (destination === "wormhole") { return cls > 0; }
		if (destination === "Drifter") { return cls >= 14 && cls <= 18; }
		var k = /^Class-(\d+)$/.exec(destination);
		if (k) { return cls === Number(k[1]); }
		if (destination === "Triglavian") { return Number(system.factionID) === 500026; }
		if (cls || Number(system.factionID) === 500026) { return false; }
		var sec = Number(system.security);
		return destination === "High-Sec" ? sec >= 0.45 : destination === "Low-Sec" ? sec > 0 && sec < 0.45 : sec <= 0;
	}

	// Faction words and a J-number's last three digits narrow; other words
	// must appear in the system's or its region's name.
	function hintsFit(hint, system, c, systems, regions, namesToo) {
		return String(hint || "").split(/\s+/).filter(Boolean).every(function(w) {
			if (c.factions[w]) { return spaceFaction(system, systems) === FACTION_IDS[c.factions[w]]; }
			if (/^\d{3}$/.test(w)) { return /^J\d{6}$/i.test(system.name || "") && system.name.slice(-3) === w; }
			if (!namesToo) { return true; }
			var region = ((regions && regions[system.regionID]) || {}).name || "";
			return up(system.name).indexOf(w) >= 0 || up(region).indexOf(w) >= 0;
		});
	}

	function fits(b, system, c, systems, regions) {
		if (b.system && systems) { return system === systems[b.system]; }
		return !!system && isType(b.destination, system) && hintsFit(b.hint, system, c, systems, regions, true);
	}

	// The one system a bookmark points at, or null when it is not one system.
	function resolve(b, c, systems, regions) {
		if (b.system) { return Number(b.system); }
		if (!b.hint) { return null; }
		var found = null, count = 0;
		Object.keys(systems).forEach(function(id) {
			if (count < 2 && fits(b, systems[id], c, systems, regions)) { found = id; count++; }
		});
		return count === 1 ? Number(found) : null;
	}

	// What a connection's far side should become: a system, else the generic
	// type Tripwire keeps for an unknown system of a known kind, else nothing.
	function farSide(b, c, systems, regions, genericTypes) {
		var exact = resolve(b, c, systems, regions);
		if (exact) { return exact; }
		var i = (genericTypes || []).indexOf(b.destination);
		return i >= 0 ? i : null;
	}

	// One line saying how a bookmark reads, for the settings' try box.
	function describe(b, c, systems, regions, genericTypes) {
		if (!b) { return "Nothing here names a signature, so it is left alone."; }
		var sig = b.id[0] === "???" ? "a signature not yet scanned" : "signature " + b.id[0] + (b.id[1] ? "-" + b.id[1] : "");
		if (b.type !== "Wormhole") {
			var what = b.type === "Unknown" ? "Signature" : b.type + " site";
			return what + ", " + sig.replace(/^signature /, "") + (b.name ? ", named “" + b.name + "”" : "");
		}
		var exact = systems ? resolve(b, c, systems, regions) : null;
		var to = exact && systems[exact] ? systems[exact].name
			: !b.destination ? "somewhere not yet known"
			: b.destination === "wormhole" ? "wormhole space"
			: b.destination === "Triglavian" ? "Pochven"
			: b.destination.replace(/^Class-/, "class ").replace("High-Sec", "high-sec").replace("Low-Sec", "low-sec").replace("Null-Sec", "null-sec");
		var parts = ["Wormhole, " + sig, "to " + to];
		if (b.hint && !exact) { parts.push("hint “" + b.hint + "”"); }
		if (b.life) { parts.push(b.life === "<1h" ? "under an hour" : "end of life"); }
		if (b.mass) { parts.push(b.mass === "critical" ? "mass under 10%" : "mass under 50%"); }
		return parts.join(", ");
	}

	return {
		DEFAULT: DEFAULT, MEANINGS: MEANINGS, merge: merge, list: list, compile: compile, convention: convention,
		toRows: toRows, fromRows: fromRows, meaningLabel: meaningLabel,
		parse: parse, siteType: siteType, resolve: resolve, farSide: farSide, fits: fits,
		hintsFit: hintsFit, describe: describe, stricter: stricter, LIFE_ORDER: LIFE_ORDER, MASS_ORDER: MASS_ORDER,
		_resetRegions: function() { regionFactions = null; }
	};
})();
