// Bookmarks pasted from EVE: titles like "C3 SHX 658 <4H <10%" become
// signatures and connections. The words are a convention, and a convention
// belongs to a group: the server's brand pack can set one, a pilot can use
// their own, and everyone else gets the default below (Squizz's, from
// squizzlabs/tripwire, where this importer started).
//
// The convention maps each meaning to the words that say it, so it reads and
// edits the way a corp would write it down: High-Sec is "HS", end of life is
// "<4H" or "EOL". Pure functions here; the paste and the settings use them.
tripwire.bookmarks = (function() {
	"use strict";

	var DEFAULT = {
		name: "Default",
		destinations: {
			"High-Sec": ["HS"], "Low-Sec": ["LS"], "Null-Sec": ["NS"],
			"Class-1": ["C1"], "Class-2": ["C2"], "Class-3": ["C3"], "Class-4": ["C4"], "Class-5": ["C5"], "Class-6": ["C6"],
			"Class-13": ["C13"], "Drifter": ["DR"], "Triglavian": ["TR", "PC"], "wormhole": ["C?"]
		},
		factions: {"Caldari": ["SQUID"], "Minmatar": ["RUST"], "Gallente": ["FRANCE"], "Amarr": ["CHINA"]},
		life: {"critical": ["<4H"], "<1h": ["<1H"]},
		mass: {"destab": ["<50%"], "critical": ["<10%"]},
		sites: {"Gas": ["GS"], "Data": ["DC"], "Relic": ["RC"], "Combat": [], "Ore": [], "auto": ["Z"]},
		unknownSignature: ["???"],
		unknownSystem: ["???"],
		home: ["*"],
		camps: ["---", "-*-"],
		bareSiteNames: true
	};
	var FACTION_IDS = {"Caldari": 500001, "Minmatar": 500002, "Amarr": 500003, "Gallente": 500004};
	var LIFE_ORDER = ["stable", "critical", "<1h"], MASS_ORDER = ["stable", "destab", "critical"];

	function clone(o) { return JSON.parse(JSON.stringify(o)); }
	function up(s) { return String(s || "").toUpperCase().trim(); }
	function list(v) { return (Array.isArray(v) ? v : String(v || "").split(/[,\s]+/)).map(up).filter(Boolean); }

	// Over the default: a section the override names replaces that section's
	// lists outright (a pack listing one unknown-system word means only that).
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

	// word -> meaning, for one section
	function lookup(section) {
		var map = {};
		Object.keys(section || {}).forEach(function(meaning) { list(section[meaning]).forEach(function(w) { map[w] = meaning; }); });
		return map;
	}

	function compile(conv) {
		return {
			conv: conv,
			destinations: lookup(conv.destinations), factions: lookup(conv.factions),
			life: lookup(conv.life), mass: lookup(conv.mass), sites: lookup(conv.sites),
			unknownSignature: list(conv.unknownSignature), unknownSystem: list(conv.unknownSystem),
			home: list(conv.home), camps: list(conv.camps), bare: conv.bareSiteNames !== false
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

	// A destination word: the convention's, or any "C<n>" that names a class.
	function destinationFor(word, c) {
		if (c.destinations[word]) { return c.destinations[word]; }
		var m = /^C(\d{1,2})$/.exec(word);
		return m ? "Class-" + m[1] : null;
	}

	var SIG = /^([A-Z]{3})(?:-?(\d{3}))?$/;

	// One pasted row -> a bookmark, or null when the row is not one. Only the
	// title (before the first tab) is read; folder and date are ignored.
	function parse(row, c) {
		var title = String(row || "").split("\t")[0].replace(/&(?:lt|#0*60|#x0*3c);/ig, "<").trim();
		if (!title) { return null; }
		var words = title.split(/\s+/), code = up(words[0]);
		var autoWord = (c.conv.sites.auto && list(c.conv.sites.auto)[0]) || "Z";
		// "ABC-123 Site name": a full id and a name with no code in front.
		if (c.bare && /^[A-Z]{3}-\d{3}$/i.test(words[0]) && words.length > 1) { words.unshift(autoWord); code = up(autoWord); }
		var destination = destinationFor(code, c), site = c.sites[code];
		if (!destination && !site) { return null; }
		var sigWord = up(words[1]), unknownSig = c.unknownSignature.indexOf(sigWord) >= 0, m = SIG.exec(sigWord);
		if (!unknownSig && !m) { return null; }
		var out = {bookmark: true, id: unknownSig ? ["???", ""] : [m[1], m[2] || ""]};
		var rest = words.slice(2);

		if (site) {
			var text = rest.join(" ").trim(), isCamp = c.camps.indexOf(up(text)) >= 0 || /^[?-]+$/.test(text);
			if (site === "auto") {
				out.name = text || undefined;
				out.type = siteType(text) || "Unknown";
			} else {
				out.type = site;
				if (text && !isCamp) { out.name = text; }
			}
			return out;
		}

		out.type = "Wormhole";
		out.destinationCode = code;
		out.destination = destination;   // "Class-3", "High-Sec", "wormhole", ...
		var hint = [];
		rest.forEach(function(w) {
			var W = up(w);
			// The home marker ("*") can sit on its own or stuck to a word.
			c.home.forEach(function(h) { if (h.length === 1) { W = W.split(h).join(""); } });
			if (!W || c.home.indexOf(W) >= 0) { return; }
			if (c.life[W]) { out.life = stricter(LIFE_ORDER, out.life, c.life[W]); return; }
			if (c.mass[W]) { out.mass = stricter(MASS_ORDER, out.mass, c.mass[W]); return; }
			hint.push(W);
		});
		var real = hint.filter(function(w) { return c.unknownSystem.indexOf(w) < 0 && !/^[?-]+$/.test(w); });
		if (real.length) { out.hint = real.join(" "); }
		return out;
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
		return !!system && isType(b.destination, system) && hintsFit(b.hint, system, c, systems, regions, true);
	}

	// The one system a bookmark points at, or null when it is not one system.
	function resolve(b, c, systems, regions) {
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

	// One line saying how a bookmark reads, for the settings' test box.
	function describe(b, c, systems, regions, genericTypes) {
		if (!b) { return "Not a bookmark this convention reads."; }
		var sig = b.id[0] === "???" ? "unknown signature" : "signature " + b.id[0] + (b.id[1] ? "-" + b.id[1] : "");
		if (b.type !== "Wormhole") { return b.type + " site, " + sig + (b.name ? ", “" + b.name + "”" : ""); }
		var to = b.destination === "wormhole" ? "wormhole space" : b.destination.replace("-", " ").toLowerCase().replace("high sec", "high-sec").replace("low sec", "low-sec").replace("null sec", "null-sec");
		var exact = systems ? resolve(b, c, systems, regions) : null;
		var parts = ["Wormhole, " + sig, "to " + (exact && systems[exact] ? systems[exact].name : to)];
		if (b.hint && !exact) { parts.push("hint “" + b.hint + "”"); }
		if (b.life) { parts.push(b.life === "<1h" ? "under an hour" : "end of life"); }
		if (b.mass) { parts.push(b.mass === "critical" ? "mass under 10%" : "mass under 50%"); }
		return parts.join(", ");
	}

	return {
		DEFAULT: DEFAULT, merge: merge, list: list, compile: compile, convention: convention,
		parse: parse, siteType: siteType, resolve: resolve, farSide: farSide, fits: fits,
		hintsFit: hintsFit, describe: describe, stricter: stricter, LIFE_ORDER: LIFE_ORDER, MASS_ORDER: MASS_ORDER,
		_resetRegions: function() { regionFactions = null; }
	};
})();
