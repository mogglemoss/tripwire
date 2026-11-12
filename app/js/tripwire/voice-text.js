// What the voice says on a jump, as plain short lines a scout can take in
// mid-warp. Pure: data in, sentences out, so it is tested without a page.
//
// The parts follow Corvus (corvus.observance.app): arrival, statics, recent
// kills, who has been killing, Thera and Turnur connections, live kills.
// The jump announcement itself is Squizz's (squizzlabs/tripwire a82ca010).
// Codes are spelled out ("B 2 7 4") so a browser voice reads a designation,
// not a number. Each line has a brief form: what you need, then quiet.
tripwire.voiceText = (function() {
	"use strict";

	var DRIFTER = {14: "Sentinel", 15: "Barbican", 16: "Vidette", 17: "Conflux", 18: "Redoubt"};
	var HUBS = {Thera: true, Turnur: true};

	function spaced(text) { return String(text).split("").join(" "); }

	function withArticle(noun) { return (/^[aeiou]/i.test(noun) ? "an " : "a ") + noun; }

	function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

	// "High-Sec" -> "high-sec", "Class-3" -> "class 3", ["Class-4","Class-5"] -> "class 4 or 5"
	function destination(leadsTo) {
		var list = Array.isArray(leadsTo) ? leadsTo : [leadsTo];
		var words = list.filter(Boolean).map(function(d) {
			return String(d).replace(/^High-Sec$/, "high-sec").replace(/^Low-Sec$/, "low-sec")
				.replace(/^Null-Sec$/, "null-sec").replace(/^Triglavian$/, "Pochven").replace(/^Class-(\d+)$/, "class $1");
		});
		if (words.length > 1 && words.every(function(w) { return /^class \d+$/.test(w); })) {
			return "class " + words.map(function(w) { return w.slice(6); }).join(" or ");
		}
		return words.join(" or ") || "unknown";
	}

	// The system's class, and what is unusual about it. null outside J-space.
	function arrival(system) {
		if (!system || !system.class) { return null; }
		var cls = Array.isArray(system.class) ? system.class[0] : system.class;
		if (system.name === "Thera") { return "Thera."; }
		if (DRIFTER[cls]) { return "Drifter space, " + DRIFTER[cls] + "."; }
		var bits = ["Class " + cls];
		if (cls == 13 || /^J0\d{5}$/.test(system.name || "")) { bits.push("shattered"); }
		if (system.effect) { bits.push(system.effect.replace(/ Star$/, "")); }
		return bits.join(", ") + ".";
	}

	// The last three digits of a J-number, the way a chain names its systems.
	function digits(system) {
		var m = system && /^J\d{3}(\d{3})$/.exec(system.name || "");
		return m ? spaced(m[1]) + "." : null;
	}

	// brief: where they go, without the codes.
	function statics(system, wormholeTypes, brief) {
		var list = (system && system.statics) || [];
		if (!list.length) { return null; }
		var parts = list.map(function(code) {
			var hole = wormholeTypes && wormholeTypes[code], where = destination(hole && hole.leadsTo);
			return brief ? where : spaced(code) + " to " + where;
		});
		return (list.length === 1 ? "Static" : "Statics") + (brief ? " " : ": ") + parts.join(", ") + ".";
	}

	function ago(ms) {
		var minutes = Math.max(1, Math.round(ms / 60000));
		if (minutes < 60) { return plural(minutes, "minute", "minutes") + " ago"; }
		return plural(Math.round(minutes / 60), "hour", "hours") + " ago";
	}

	// Round figures a voice can say: "250 million", "1.2 billion".
	function iskWords(value) {
		value = Number(value) || 0;
		if (value >= 1e9) { return (Math.round(value / 1e8) / 10) + " billion"; }
		if (value >= 1e6) { return Math.round(value / 1e6) + " million"; }
		return null;
	}

	function newest(list) {
		return list.slice().sort(function(a, b) { return Date.parse(b.killmail_time) - Date.parse(a.killmail_time); })[0];
	}

	// zKillboard's kills for the window. hullName(typeID) names a ship.
	// brief: the count and how recent, no window or hull.
	function kills(list, hours, now, hullName, brief) {
		if (!Array.isArray(list)) { return null; }
		var span = "in the last " + plural(hours, "hour", "hours");
		if (!list.length) { return brief ? "No kills." : "No kills " + span + "."; }
		var last = newest(list), when = ago(now - Date.parse(last.killmail_time));
		if (brief) { return plural(list.length, "kill", "kills") + ", latest " + when + "."; }
		var ship = last.victim && hullName(last.victim.ship_type_id);
		var latest = ship ? ", latest " + withArticle(ship) + ", " + when : "";
		return plural(list.length, "kill", "kills") + " " + span + latest + ".";
	}

	// Who has been doing the killing, when it is a group rather than a crowd:
	// the corporation on the most kills, and how many pilots were involved.
	// Returns the corporation id to name, or null when there is no pattern.
	function whoCounts(list) {
		if (!Array.isArray(list) || list.length < 2) { return null; }
		var corpKills = {}, pilots = {};
		list.forEach(function(k) {
			var seen = {};
			(k.attackers || []).forEach(function(a) {
				if (!a.character_id) { return; }   // NPCs and structures
				pilots[a.character_id] = true;
				if (a.corporation_id && !seen[a.corporation_id]) { seen[a.corporation_id] = true; corpKills[a.corporation_id] = (corpKills[a.corporation_id] || 0) + 1; }
			});
		});
		var top = null;
		Object.keys(corpKills).forEach(function(id) { if (!top || corpKills[id] > corpKills[top]) { top = id; } });
		var pilotCount = Object.keys(pilots).length;
		if (!top || corpKills[top] < 2 || pilotCount > 12) { return null; }
		return {corporationID: Number(top), kills: corpKills[top], pilots: pilotCount};
	}

	function who(counts, corpName, brief) {
		if (!counts || !corpName) { return null; }
		var line = "Mostly " + corpName + (brief ? "" : ", " + plural(counts.pilots, "pilot", "pilots"));
		return /\.$/.test(line) ? line : line + ".";   // a name like "Acme Inc." already ends the sentence
	}

	// EVE-Scout's public connections (the server's cached copy). A link's
	// out side is Thera or Turnur; its in side is the system it reaches.
	function hubLinks(links, systemID, brief) {
		return (links || []).filter(function(l) {
			return Number(l.in_system_id) === Number(systemID) && HUBS[l.out_system_name];
		}).map(function(l) {
			var line = l.out_system_name + (brief ? " here" : " connection here");
			if (l.in_signature) { line += ", signature " + spaced(String(l.in_signature).replace(/-.*$/, "")); }
			if (!brief && l.remaining_hours != null) { line += ", " + plural(Math.max(1, Math.round(l.remaining_hours)), "hour", "hours") + " left"; }
			return line + ".";
		}).join(" ") || null;
	}

	function liveKill(kill, hullName, brief) {
		var ship = kill && kill.victim && hullName(kill.victim.ship_type_id);
		var value = iskWords(kill && kill.zkb && kill.zkb.totalValue);
		return (brief ? "Kill: " : "Kill in system: ") + (ship ? withArticle(ship) : "a ship") + (value && !brief ? ", " + value : "") + ".";
	}

	// Systems on the current map: either end of any wormhole the client holds.
	function mappedSystems(signatures, wormholes) {
		var mapped = {};
		Object.keys(wormholes || {}).forEach(function(id) {
			var hole = wormholes[id];
			[hole.initialID, hole.secondaryID].forEach(function(sigID) {
				var sig = signatures && signatures[sigID];
				if (sig && sig.systemID) { mapped[Number(sig.systemID)] = true; }
			});
		});
		return mapped;
	}

	return {
		spaced: spaced, destination: destination, arrival: arrival, digits: digits, statics: statics,
		kills: kills, whoCounts: whoCounts, who: who, hubLinks: hubLinks, liveKill: liveKill,
		iskWords: iskWords, ago: ago, mappedSystems: mappedSystems
	};
})();
