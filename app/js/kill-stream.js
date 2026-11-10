// Recent kills for a wormhole system, from zKillboard, in our own markup.
//
// ESI's hourly activity feed covers no wormhole system, so the System
// panel's graph read "no activity" in every J-system. zKillboard records
// every player loss. In J-space the graph gives way to the system's last
// eight hours of kills: the five newest as hull, value and age, each a
// link to its mail on the board. k-space keeps the ESI graph, where jumps
// and NPC kills are real. One request per system, cached five minutes and
// refreshed on that cadence while the system stays in view; the board's
// own Streambox was tried first and could not wear the room.
tripwire.killStream = (function() {
	"use strict";
	var BASE = "https://zkillboard.com", IMG = "https://images.evetech.net/types/";
	var WINDOW = 8 * 3600, CACHE_MS = 5 * 60 * 1000, SHOW = 5;
	var current = null, request = 0, cache = {}, timer = null;

	function isWormhole(systemID) {
		var r = systemAnalysis.analyse(systemID);
		return !!(r && r.class);
	}

	function placeLinks(wormhole) {
		var $links = $("#infoLinks");
		if (!$links.length) { return; }
		if (wormhole) {
			$links.appendTo("#killStream").addClass("in-killstream-foot").removeClass("in-legend-row");
		} else if ($("#activityGraphControls").length) {
			$links.appendTo("#activityGraphControls").addClass("in-legend-row").removeClass("in-killstream-foot");
		}
	}

	// zKillboard, asked as little as possible. One fetcher for the strip and
	// the voice: identical requests in flight are shared, the eight-hour list
	// is kept five minutes, and the one-hour list (the smallest window zKill
	// accepts; a shorter one answers [null]) is kept a minute. Kills found in
	// the hour are merged into the eight hours, so while the voice is checking
	// a system once a minute the strip needs no eight-hour request of its own.
	var RECENT = 3600, RECENT_MS = 60 * 1000, recentCache = {}, inFlight = {};

	function fetchKills(systemID, seconds) {
		var url = BASE + "/api/kills/solarSystemID/" + systemID + "/pastSeconds/" + seconds + "/";
		if (inFlight[url]) { return inFlight[url]; }
		inFlight[url] = fetch(url, { headers: { Accept: "application/json" } })
			.then(function(r) { if (!r.ok) { throw new Error("zKillboard " + r.status); } return r.json(); })
			.then(function(list) {
				if (!Array.isArray(list)) { throw new Error("zKillboard shape"); }
				return list.filter(function(k) { return k && k.killmail_id && k.killmail_time; });
			})
			.finally(function() { delete inFlight[url]; });
		return inFlight[url];
	}

	function inWindow(list) {
		var since = Date.now() - WINDOW * 1000;
		return list.filter(function(k) { return Date.parse(k.killmail_time) >= since; });
	}

	function kills(systemID) {
		var hit = cache[systemID];
		if (hit && Date.now() - hit.at < CACHE_MS) { return Promise.resolve(inWindow(hit.list)); }
		return fetchKills(systemID, WINDOW).then(function(list) { cache[systemID] = { list: list, at: Date.now() }; return list; });
	}

	// The last hour. New kills are folded into the eight-hour list, and the
	// strip redrawn if it is showing this system.
	function recent(systemID, fresh) {
		var hit = recentCache[systemID];
		if (!fresh && hit && Date.now() - hit.at < RECENT_MS) { return Promise.resolve(hit.list); }
		return fetchKills(systemID, RECENT).then(function(list) {
			recentCache[systemID] = { list: list, at: Date.now() };
			var held = cache[systemID];
			if (held) {
				var known = {};
				held.list.forEach(function(k) { known[k.killmail_id] = true; });
				var added = list.filter(function(k) { return !known[k.killmail_id]; });
				held.list = inWindow(added.concat(held.list));
				held.at = Date.now();
				if (added.length && current == systemID) { label(held.list.length); render(held.list); $("#killStream").removeClass("is-quiet"); }
			}
			return list;
		});
	}

	// 15210.83 -> "15.2k", 3373.24 -> "3.4k", 450100000 -> "450.1m", 1.2e9 -> "1.2b"
	function isk(v) {
		v = Number(v) || 0;
		if (v >= 1e9) { return (v / 1e9).toFixed(1) + "b"; }
		if (v >= 1e6) { return (v / 1e6).toFixed(1) + "m"; }
		if (v >= 1e3) { return (v / 1e3).toFixed(1) + "k"; }
		return Math.round(v).toString();
	}
	function age(iso) {
		var s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
		if (s < 3600) { return Math.max(1, Math.round(s / 60)) + "m"; }
		return (s / 3600).toFixed(s < 36000 ? 1 : 0).replace(/\.0$/, "") + "h";
	}
	function hull(typeID) {
		var t = appData.mass && appData.mass[typeID];
		return t && t.typeName ? t.typeName : "Unknown hull";
	}
	function sortNewest(list) {
		return list.slice().sort(function(a, b) { return Date.parse(b.killmail_time) - Date.parse(a.killmail_time); });
	}

	function label(n) {
		$("#killStreamWindow").text((n ? (n === 1 ? "1 kill" : n + " kills") + " in the past 8 hours" : "past 8 hours") + " · zKillboard");
	}

	function render(list) {
		var $strip = $("#killStreamStrip").empty();
		sortNewest(list).slice(0, SHOW).forEach(function(k) {
			var v = k.victim || {}, z = k.zkb || {};
			var name = hull(v.ship_type_id), value = isk(z.totalValue), when = age(k.killmail_time);
			var tags = [];
			if (z.npc) { tags.push("NPC"); }
			if (z.solo) { tags.push("solo"); }
			var $a = $("<a class='kill' role='listitem' target='_blank' rel='noopener noreferrer'></a>")
				.attr("href", BASE + "/kill/" + k.killmail_id + "/")
				.attr("title", name + " · " + value + " ISK · " + when + " ago" + (tags.length ? " · " + tags.join(", ") : ""))
				.toggleClass("is-npc", !!z.npc);
			$("<img class='kill-hull' alt='' loading='lazy' decoding='async'>").attr("src", IMG + v.ship_type_id + "/render?size=64").appendTo($a);
			$("<span class='kill-name'></span>").text(name).appendTo($a);
			$("<span class='kill-meta'></span>").append($("<b></b>").text(value)).append(document.createTextNode(" · " + when)).appendTo($a);
			$a.appendTo($strip);
		});
	}

	function show(systemID, force) {
		var $block = $("#killStream");
		$("#killStreamLink").attr("href", BASE + "/system/" + systemID + "/");
		$block.removeClass("hidden");
		if (current === systemID && !force) { return; }
		current = systemID;
		var mine = ++request;
		$block.removeClass("is-quiet").removeClass("is-failed").addClass("is-waiting");
		if (!force) { label(null); }
		kills(systemID).then(function(list) {
			if (mine !== request) { return; }
			$block.removeClass("is-waiting");
			label(list.length);
			if (!list.length) { $("#killStreamStrip").empty(); $block.addClass("is-quiet"); return; }
			render(list);
		}).catch(function() {
			if (mine !== request) { return; }
			$block.removeClass("is-waiting").addClass("is-failed");
		});
		clearTimeout(timer);
		// Refetches only if the list was not kept current meanwhile (see recent()).
		timer = setTimeout(function() { if (current === systemID && !document.hidden) { show(systemID, true); } }, CACHE_MS);
	}

	function hide() {
		clearTimeout(timer); request++;
		$("#killStream").addClass("hidden").removeClass("is-waiting is-quiet is-failed");
		$("#killStreamStrip").empty();
		current = null;
	}

	// Called whenever the viewed system changes.
	function refresh(systemID) {
		var wormhole = isWormhole(systemID);
		$("#infoWidget").toggleClass("is-wormhole", wormhole);
		placeLinks(wormhole);
		if (wormhole) { show(systemID); } else { hide(); }
	}

	return { refresh: refresh, isWormhole: isWormhole, isk: isk, age: age, kills: kills, recent: recent };
})();
