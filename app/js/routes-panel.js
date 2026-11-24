// The Routes panel: saved destinations, each with the route to it from the
// tracked pilot (or the viewed system), across gates, this mask's chain and,
// if asked, EVE-Scout's holes. The layout follows Aperture's route planner:
// where from, how safe, what ship, holes to leave out, then one card per
// destination with its hops as a strip.
//
// A destination is a system the pilot named, or "the nearest" of a kind:
// trade hubs, blue loot buyers, red loot buyers, security offices
// (routePresets, generated from EVE's market data), or holes into Thera or
// Turnur. Those cards list the nearest few from where the routes start, with
// the jumps to each, so the pilot can take the one a little further off; one
// row at a time is open to show its route and where to dock.
//
// The arrow gives the route to EVE. The gates it starts with go in as one
// waypoint each, so the autopilot flies this route and not its own; a route
// with wormholes in it is then followed (tripwire.routeFollow): after each
// hole, the gates on the far side go in by themselves.
//
// The routes come from tripwire.route (the shared route model). The panel
// only reads the map: nothing here writes a signature or a connection. Its
// own state (where from, preferences, destinations) is options.routes, saved
// with the account.
//
// Routes are recomputed when what they depend on changes, found by comparing
// a key on a slow tick rather than by hooks in the sync, the tracker and the
// chain map: the pilot jumped, a hole changed state, a preference changed.
tripwire.routesPanel = (function() {
	"use strict";

	var SCOUT_URL = "cached_third_party.php?key=eve-scout-signatures", SCOUT_EVERY = 60000, TICK = 1500;
	var lastKey = null, planned = [], ownScout = null, scoutAt = 0, scoutPending = false, scoutFailed = false, source = null;
	var THERA = 31000005, TURNUR = 30002086;       // EVE-Scout lists the holes into both

	// The kinds of place a route can be to the nearest of, in menu order. The
	// first four are fixed lists (routePresets). The last two are whatever
	// systems EVE-Scout says have a hole into that hub right now: the way in,
	// not the hub itself.
	var KINDS = [
		{key: "hubs", label: "Trade hubs", phrase: "trade hubs", none: "No trade hub", count: 5},
		{key: "blue", label: "Blue loot", phrase: "blue loot", none: "No blue loot buyer", count: 3},
		{key: "red", label: "Red loot", phrase: "red loot", none: "No red loot buyer", count: 3},
		{key: "sec", label: "Security offices", phrase: "security offices", none: "No security office", count: 3},
		{key: "thera", label: "Thera", phrase: "Thera holes", none: "No Thera hole", count: 3, hub: THERA},
		{key: "turnur", label: "Turnur", phrase: "Turnur holes", none: "No Turnur hole", count: 3, hub: TURNUR}
	];
	var openRow = {};       // which row of a kind's card is open, by kind: a system id. Not saved.
	function kind(key) { return KINDS.filter(function(k) { return k.key === key; })[0] || null; }
	function presets() { return (source && source.presets) || (typeof routePresets !== "undefined" ? routePresets : {sets: {}, stations: {}}); }
	function kindSystems(key) { return Object.keys(presets().sets[key] || {}).map(Number); }
	function stationsAt(key, systemID) {
		var all = presets();
		return ((all.sets[key] || {})[systemID] || []).map(function(id) { return {id: Number(id), name: all.stations[id] || String(id)}; });
	}

	// ---- state ----------------------------------------------------------------

	function state() {
		if (!options.routes) { options.routes = {from: "pilot", destinations: []}; }
		var r = options.routes;
		if (!Array.isArray(r.destinations)) { r.destinations = []; }
		if (!Array.isArray(r.nearest)) { r.nearest = []; }
		if (!r.prefs || !r.prefs.mode) {
			// First time: the two older settings, in the new terms.
			r.prefs = tripwire.route.prefsFromLegacy(options.chain);
			guidance.clearCache();
		}
		if (!Array.isArray(r.prefs.avoid)) { r.prefs.avoid = []; }
		if (r.prefs.skipUnscanned !== undefined) {
			// The preference's first name. Such a hole may well have been
			// scanned; what the map lacks is its signature.
			if (r.prefs.skipNoSig === undefined) { r.prefs.skipNoSig = !!r.prefs.skipUnscanned; }
			delete r.prefs.skipUnscanned;
		}
		return r;
	}
	function prefs() { return routeEngine.withDefaults(state().prefs); }
	function save() { options.saveDelay(600); }

	function systemName(id) { return (tripwire.systems || appData.systems)[id] ? (tripwire.systems || appData.systems)[id].name : String(id); }
	function isSystem(id) { return !!(tripwire.systems || appData.systems)[id]; }

	// The tracked pilot's system, when one is tracked and located. A change of
	// the viewed system drops client.EVE until the next location report; the
	// character's own record still has it.
	function pilotSystem() {
		var eve = tripwire.client && tripwire.client.EVE;
		if (!eve) { eve = tripwire.esi && tripwire.esi.characters && tripwire.esi.characters[options.tracking.active]; }
		var id = eve && Number(eve.systemID);
		return id && isSystem(id) ? id : null;
	}
	// Where routes start: the tracked pilot, the system being viewed, or one
	// the pilot typed in. `fallback` when the choice has no system yet (no
	// tracked pilot, nothing typed), and the viewed system stands in.
	function origin() {
		var s = state(), viewed = Number(viewingSystemID);
		if (s.from === "system") { return {id: viewed, from: "system"}; }
		if (s.from === "manual") {
			var m = Number(s.fromSystem);
			return m && isSystem(m) ? {id: m, from: "manual"} : {id: viewed, from: "manual", fallback: true};
		}
		var p = pilotSystem();
		return p ? {id: p, from: "pilot"} : {id: viewed, from: "pilot", fallback: true};
	}
	function originText(o) {
		var name = systemName(o.id);
		if (o.from === "pilot") { return "From " + name + (o.fallback ? " (no tracked pilot, so this system)" : " (your pilot)"); }
		if (o.from === "manual" && o.fallback) { return "From " + name + " (type a start system)"; }
		return "From " + name;
	}

	// ---- EVE-Scout --------------------------------------------------------------

	// The chain map's supplier holds the links only while a tab shows them, so
	// the panel fetches its own copy when the preference is on.
	function scoutLinks() {
		if (typeof eveScout !== "undefined" && eveScout.links && eveScout.links.length) { return eveScout.links; }
		return ownScout || [];
	}
	// Wanted when routes may use the holes, or a card is looking for one.
	function needScout() { return prefs().scout || state().nearest.some(function(key) { var k = kind(key); return k && k.hub; }); }
	function scoutLoaded() { return !!source || ownScout !== null || scoutLinks().length > 0; }
	function refreshScout() {
		if (!needScout() || scoutPending || Date.now() - scoutAt < SCOUT_EVERY) { return; }
		scoutPending = true;
		$.ajax({url: SCOUT_URL, type: "GET", dataType: "JSON"}).done(function(data) {
			ownScout = Array.isArray(data) ? data : [];
			scoutFailed = !Array.isArray(data);
		}).fail(function(xhr, status) {
			// Said in the panel, not only here: a route planned without the
			// holes the pilot asked for should not look like one planned with them.
			console.warn("Routes: could not load EVE-Scout's connections: " + status);
			scoutFailed = true;
		}).always(function() { scoutPending = false; scoutAt = Date.now(); refresh(true); });
	}

	// ---- compute ----------------------------------------------------------------

	function mapSource() { return source || {scoutLinks: scoutLinks()}; }

	// EVE-Scout's holes into a hub, by the system on the other side: the ways
	// in. Holes the preferences rule out (too small, too close to the end)
	// are left out unless `all`. The longest-lived hole in a system is first.
	function entrances(k, p, src, all) {
		var out = {};
		tripwire.route.scout(src).forEach(function(h) {
			var other = h.a === k.hub ? h.b : h.b === k.hub ? h.a : null;
			if (!other || other === k.hub || (!all && routeEngine.scoutBlocked(h, p))) { return; }
			(out[other] = out[other] || []).push({sig: h.a === k.hub ? h.sigB : h.sigA, hours: h.remainingHours, type: h.type, size: h.size});
		});
		Object.keys(out).forEach(function(id) { out[id].sort(function(x, y) { return (y.hours || 0) - (x.hours || 0); }); });
		return out;
	}

	// Everything a route depends on, as one string.
	function key() {
		var s = state(), o = origin(), src = mapSource();
		var holes = tripwire.route.holes(src).map(function(h) { return [h.id, h.a, h.b, h.life, h.mass, h.size, h.noSig ? 1 : 0].join(":"); }).join("|");
		var scout = needScout() ? tripwire.route.scout(src).map(function(h) { return h.id + ":" + h.remainingHours; }).join("|") : "";
		return JSON.stringify([o.id, o.fallback ? 1 : 0, s.from, s.fromSystem || 0, s.prefs, s.destinations, s.nearest, Number(viewingSystemID)]) + "#" + holes + "#" + scout +
			"#" + ($("#routesWidget").hasClass("panel-hidden") ? 0 : 1);
	}

	function compute() {
		var o = origin(), p = prefs(), src = mapSource(), s = state();
		function entry(destination, route, extra) {
			route = followedRoute(destination, extra, o) || route;
			return $.extend({destination: destination, route: route, summary: route ? tripwire.route.summary(route, src) : null,
				waypoint: route ? tripwire.route.waypoint(route) : null}, extra);
		}
		planned = s.destinations.map(function(dest) {
			var route = tripwire.route.plan(o.id, dest, p, src);
			// No route: is there none at all, or none the preferences allow?
			return entry(Number(dest), route, route ? null : {blocked: !!tripwire.route.plan(o.id, dest, {scout: p.scout}, src)});
		}).concat(s.nearest.filter(kind).map(function(key) {
			var k = kind(key), ways = null, systems, every, via = viaPrefs(key), relaxed = {scout: p.scout};
			if (k.hub) {
				// To the ways in, by gates and the chain: not through the hub's own holes.
				ways = entrances(k, p, src);
				systems = Object.keys(ways).map(Number);
				every = Object.keys(entrances(k, p, src, true)).map(Number);
				relaxed = {};
			} else { systems = every = kindSystems(key); }
			var rows = tripwire.route.nearest(o.id, systems, via, k.count, src).map(function(route) {
				return entry(route.to, route, {kindKey: key, stations: k.hub ? [] : stationsAt(key, route.to), ways: k.hub ? ways[route.to] : []});
			});
			return {kind: key, rows: rows, listed: every.length,
				blocked: !rows.length && !!tripwire.route.plan(o.id, every, relaxed, src)};
		}));
		return planned;
	}

	function refresh(force) {
		if (!document.getElementById("routesWidget")) { return; }
		refreshScout();
		if (!force && tripwire.route.loading(source)) { return; }      // half a map: keep what is drawn
		var k = key();
		if (!force && k === lastKey) { return; }
		lastKey = k;
		compute();
		render();
	}

	// ---- render -----------------------------------------------------------------

	function esc(s) { return _.escape(String(s === null || s === undefined ? "" : s)); }

	// The panel's own tooltips sit above what they describe. The app's
	// default opens to the side, which here is over the next hop in a strip
	// or the next chip in a row: the very thing the pointer is heading for.
	// One tooltip, opened for whatever is under the pointer, so cards can be
	// redrawn without anything to attach or let go of.
	var tips = null;
	function showTip(el) {
		if (typeof jBox === "undefined") { return; }
		if (!tips) { tips = new jBox("Tooltip", {position: {x: "center", y: "top"}, outside: "y", addClass: "routes-tip"}); }
		tips.setContent(el.getAttribute("data-tip")).open({target: $(el)});
	}
	function hideTip() { if (tips) { tips.close(); } }
	// "abc123" as Tripwire stores it, or "ABC-123" as EVE-Scout sends it: ABC-123 either way.
	function sig(id) {
		var s = String(id || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
		return s ? s.substring(0, 3) + (s.length >= 6 ? "-" + s.substring(3, 6) : "") : null;
	}
	function secText(sys) { return sys.class ? sys.systemTypeName : sys.systemTypeName + " " + Number(sys.baseSecurity).toFixed(2); }

	// What to say about the jump into a system.
	function hopText(step, fromID) {
		if (step.via === "gate") { return "gate"; }
		// The signature on the side the pilot is jumping from: the one to
		// warp to. The far side's is no use on the way through.
		var h = step.hole, near = h.a === fromID ? h.sigA : h.sigB;
		if (step.via === "eve_scout") { return "EVE-Scout hole" + (near ? " " + sig(near) : "") + (h.remainingHours !== null ? ", " + h.remainingHours + "h left" : ""); }
		var bits = ["wormhole" + (near ? " " + sig(near) : "")];
		if (h.type && !/^\?+$/.test(h.type)) { bits.push(h.type); }
		if (h.life === "eol") { bits.push("EOL"); } else if (h.life === "last_hour") { bits.push("under 1h"); }
		if (h.mass === "critical") { bits.push("mass critical"); } else if (h.mass === "reduced") { bits.push("mass reduced"); }
		if (h.noSig) { bits.push("no sig recorded"); }
		return bits.join(", ");
	}
	// A chain hole's state as the classes of its mark, coloured as the chain
	// map and the signature list colour them: reduced mass a caution, end of
	// life and critical mass a warning, the last hour its own.
	function linkState(step) {
		if (step.via !== "wh") { return ""; }
		var h = step.hole;
		return (h.life === "last_hour" ? " is-last-hour" : h.life === "eol" || h.mass === "critical" ? " is-critical" : h.mass === "reduced" ? " is-reduced" : "") +
			(h.noSig ? " is-no-sig" : "");
	}

	function hop(id, title, extra) {
		var sys = systemAnalysis.analyse(id);
		return '<span class="route-hop ' + esc(sys.systemTypeClass) + (sys.class ? " is-j" : "") + (extra || "") + '" data-system="' + id + '" ' +
			'data-tip="' + esc(sys.name + " (" + secText(sys) + ") \u00b7 " + title) + '"></span>';
	}

	function strip(route) {
		var out = hop(route.from, "start", " is-origin"), prev = route.from;
		route.steps.forEach(function(step) {
			if (step.via !== "gate") {
				out += '<i class="route-link is-' + (step.via === "wh" ? "wh" : "scout") + linkState(step) + '" aria-hidden="true"></i>';
			}
			out += hop(step.to, hopText(step, prev));
			prev = step.to;
		});
		// One picture to a screen reader, not a tab stop per hop: the destination's name is the link.
		var said = route.jumps + " jumps: " + route.path.map(systemName).join(", ");
		return '<div class="route-strip" role="img" aria-label="' + esc(said) + '">' + out + "</div>";
	}

	// The preferences in a few words, for the line above the routes.
	var MODE = {shortest: "shortest", safer: "safer", less_safe: "less safe"}, SHIP = {s: "frigate", m: "medium", l: "large", xl: "extra-large"};
	function prefsText(p) {
		var bits = [MODE[p.mode] || "shortest"];
		if (p.minShip) { bits.push(SHIP[p.minShip] + " or bigger holes"); }
		var skip = [p.skipEol && "EOL", p.skipCrit && !p.skipReduced && "crit", p.skipReduced && "reduced mass", p.skipNoSig && "no sig"].filter(Boolean);
		if (skip.length) { bits.push("skipping " + skip.join(", ")); }
		if (p.scout) { bits.push(scoutFailed && !scoutLinks().length ? "EVE-Scout not loading" : "with EVE-Scout"); }
		if (p.avoid.length) { bits.push("avoiding " + p.avoid.length); }
		return bits;
	}

	function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

	// What the route passes through, then what to be careful of, on one line.
	function meta(s) {
		var bits = [];
		if (s.holes) { bits.push(plural(s.holes, "wormhole", "wormholes")); }
		if (s.low) { bits.push(s.low + " low-sec"); }
		if (s.nullsec) { bits.push(s.nullsec + " null-sec"); }
		if (s.jspace) { bits.push(s.jspace + " J-space"); }
		return bits.join(" \u00b7 ");
	}
	function warnings(s) {
		var bits = [];
		if (s.noSig) { bits.push({text: s.noSig + " no sig", cls: "is-caution"}); }
		if (s.eol) { bits.push({text: s.eol + " EOL", cls: "is-critical"}); }
		if (s.crit) { bits.push({text: s.crit + " crit", cls: "is-critical"}); }
		return bits;
	}

	// Where the arrow sends the in-game autopilot. A route that is all gates
	// to a station we know goes to the station itself; otherwise to where the
	// gates end, since the autopilot cannot follow a wormhole.
	function flyTarget(p) {
		var r = p.route;
		if (!r) { return null; }
		if (p.stations && p.stations.length && (!r.jumps || p.waypoint === r.to)) { return {id: p.stations[0].id, name: p.stations[0].name}; }
		if (!p.waypoint) { return null; }
		return {id: p.waypoint, name: systemName(p.waypoint) + (p.waypoint !== r.to ? " (where the gates end)" : "")};
	}

	var FLY_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>';

	// Why there is no route, and what would give one.
	function noRoute(p) {
		var k = p.kind ? kind(p.kind) : null;
		if (k && k.hub && !p.listed) {
			// Nothing to route to: say whether EVE-Scout has answered at all.
			return '<p class="route-none">' + (!scoutLoaded() ? (scoutFailed ? "EVE-Scout is not loading." : "Asking EVE-Scout\u2026") : esc(k.none) + " listed by EVE-Scout.") + "</p>";
		}
		if (k) { return '<p class="route-none">' + esc(k.none) + (p.blocked ? " with these preferences." : " in reach.") + "</p>"; }
		if (p.blocked) { return '<p class="route-none">No route with these preferences.</p>'; }
		var scout = p.destination === THERA && !prefs().scout;
		return '<p class="route-none">' + (scout ? "No hole to Thera on this chain. " : "Nothing on the map connects.") +
			(scout ? '<button type="button" class="route-link-btn route-use-scout">Use EVE-Scout</button>' : "") + "</p>";
	}

	// ---- giving a route to EVE -------------------------------------------------

	// What the bar under the list says when nothing is being followed. (Under
	// it, so that opening does not move the arrow that was just pressed.)
	var notice = null, noticeTimer = null, oneOff = 0;
	function say(text, tone, stays) {
		clearTimeout(noticeTimer);
		notice = text ? {text: text, tone: tone || ""} : null;
		if (text && !stays) { noticeTimer = setTimeout(function() { notice = null; renderFollow(); }, 8000); }
		renderFollow();
	}

	// One waypoint call per system, in order.
	function give(ids, characterID, wanted) {
		return tripwire.routeFollow.deliver(ids, function(id, first) {
			if (!tripwire.esi.characters[characterID]) { throw new Error("the pilot is no longer linked"); }
			return tripwire.esi.setDestination(id, characterID, first);
		}, wanted);
	}
	function refused(result) { return "EVE took " + result.sent + " of " + plural(result.of, "waypoint", "waypoints") + " (" + result.error + "). Press the arrow to try again."; }

	// The preferences a card's routes are planned with: to a way into a hub,
	// not through the hub's own holes.
	function viaPrefs(key) { var k = key && kind(key); return k && k.hub ? $.extend({}, prefs(), {scout: false}) : prefs(); }

	var following = tripwire.routeFollow({
		at: pilotSystem,
		character: function() { return options.tracking.active; },
		mask: function() { return options.masks.active; },
		// Not on half a map, and not without EVE-Scout's list when the route uses it.
		waiting: function(f) {
			return tripwire.route.loading(source) ||
				(!source && !scoutLinks().length && f.route.steps.some(function(s) { return s.via === "eve_scout"; }));
		},
		onward: function(f, at) { return tripwire.route.onward(f.route, at, viaPrefs(f.kind), mapSource()); },
		send: give,
		changed: function() { refresh(true); },
		ended: function(f, why) {
			if (why === "") { return; }
			if (why) { say("Stopped following to " + systemName(f.to) + ": " + why + ".", "is-caution", true); }
			else { say("Arrived in " + systemName(f.to) + "."); }
		}
	});
	function isFollowed(destination, key) {
		var f = following.current();
		return !!f && f.to === Number(destination) && f.kind === (key || null);
	}
	// The card of the route being followed shows the one being flown.
	function followedRoute(destination, extra, o) {
		var f = following.current();
		return f && isFollowed(destination, extra && extra.kindKey) && f.route.from === o.id ? f.route : null;
	}

	// What the arrow would do: {ids, follow, name, tip}, or null when there is
	// nothing for the autopilot in it. From where the pilot is, the route
	// itself; from anywhere else, only its end, as EVE finds its own way there.
	function flight(p) {
		var r = p.route, station = p.stations && p.stations[0];
		if (!r) { return null; }
		if (r.from !== pilotSystem()) {
			var target = flyTarget(p);
			return target && {ids: [target.id], follow: false, name: target.name, tip: "Set in-game destination: " + target.name};
		}
		var ids = following.waypoints(r, station && station.id), gates = tripwire.route.stretch(r);
		var name = station && ids[ids.length - 1] === station.id ? station.name : gates.length ? systemName(gates[gates.length - 1]) : null;
		if (!r.holes) { return ids.length ? {ids: ids, follow: false, name: name, tip: "Set in-game route: " + name + (gates.length > 1 ? ", by these " + gates.length + " gates" : "")} : null; }
		if (!r.gates) { return null; }
		return {ids: ids, follow: true, name: name, tip: isFollowed(p.destination, p.kindKey) ? "Following: press to set it again" :
			gates.length ? "Follow: set in-game route to " + name + ", and on after the wormhole" :
			"Follow: after the wormhole, set the in-game route on"};
	}

	function fly(p) {
		var plan = flight(p), who = options.tracking.active;
		if (!plan || !canFly()) { return; }
		var turn = ++oneOff;
		say(null);
		if (plan.follow) {
			return following.start({to: p.route.to, kind: p.kindKey || null, route: p.route, station: p.stations && p.stations[0] ? p.stations[0].id : null, character: who, mask: options.masks.active});
		}
		following.stop("you set another route");
		say("Setting the route in EVE\u2026", "", true);
		return give(plan.ids, who, function() { return turn === oneOff; }).then(function(result) {
			if (turn !== oneOff) { return; }
			if (result.error) { say(refused(result), "is-critical", true); } else { say("Set in EVE: " + plan.name + "."); }
		});
	}
	function stopFollowing(why) { oneOff++; say(null); following.stop(why); }

	// The next hole on the route being followed, as what to warp to.
	function nextHole(f) {
		var prev = f.route.from;
		for (var i = 0; i < f.route.steps.length; i++) {
			var s = f.route.steps[i];
			if (s.via !== "gate") {
				var near = sig(s.hole.a === prev ? s.hole.sigA : s.hole.sigB);
				return near || "the wormhole to " + systemName(s.to) + " (no sig)";
			}
			prev = s.to;
		}
		return null;
	}
	function followText(f) {
		var hole = nextHole(f), gates = tripwire.route.stretch(f.route);
		if (f.state === "sending") { return "Setting the route in EVE\u2026"; }
		if (f.state === "error") { return refused(f.error); }
		if (f.state === "off") { return "Off the route. Go back to it, or press the arrow to start from here."; }
		if (f.state === "stuck") { return "No route there any more."; }
		if (f.state === "hole") { return /^the /.test(hole) ? "Take " + hole : "Warp to " + hole; }
		return !gates.length ? "" : hole ? "In EVE as far as " + systemName(gates[gates.length - 1]) + ", then " + hole : "In EVE all the way";
	}
	var FOLLOW_TONE = {error: " is-critical", off: " is-caution", stuck: " is-critical"}, followHtml = null;
	function renderFollow() {
		var f = following.current(), html = "", tone = "";
		if (f) {
			tone = FOLLOW_TONE[f.state] || "";
			html = '<span class="routes-follow-text"><b>To ' + esc(systemName(f.to)) + "</b> " + esc(followText(f)) + '</span><button type="button" class="routes-follow-stop" data-tip="Stop following. The route in EVE stays as it is.">Stop</button>';
		} else if (notice) {
			tone = notice.tone ? " " + notice.tone : "";
			html = '<span class="routes-follow-text">' + esc(notice.text) + '</span><button type="button" class="route-btn routes-follow-dismiss" aria-label="Dismiss">&times;</button>';
		}
		// Only when it says something else: it is read out when it changes.
		if (followHtml === html + tone) { return; }
		followHtml = html + tone;
		$("#routes-follow").attr("class", "routes-follow" + (f ? " is-following" : "") + tone).prop("hidden", !html).html(html);
	}

	function canFly() { return !!(tripwire.esi && tripwire.esi.characters && tripwire.esi.characters[options.tracking.active]); }
	function flyButton(p) {
		if (!canFly()) { return ""; }
		var plan = flight(p), r = p.route, on = plan && plan.follow && isFollowed(p.destination, p.kindKey);
		if (plan) { return '<button type="button" class="route-btn route-fly' + (on ? " is-on" : "") + '" data-tip="' + esc(plan.tip) + '" aria-label="' + esc(plan.tip) + '">' + FLY_ICON + "</button>"; }
		// Nothing for the autopilot: it starts with a wormhole and the pilot is
		// not there to follow it, or it is wormholes all the way. The arrow
		// stays, dimmed, and says so: one arrow in a list of five reads as a
		// mark on that row, not as the only route with gates to fly.
		if (r && r.jumps) { return '<span class="route-btn route-fly is-off" data-tip="' + (r.gates ? "Starts with a wormhole: nothing for the autopilot to follow" : "All wormholes: nothing for the autopilot to follow") + '">' + FLY_ICON + "</span>"; }
		return "";
	}
	// The route itself: its hops, then what it passes through and what to be careful of.
	function detail(p) {
		var r = p.route, s = p.summary;
		if (!r.jumps) { return '<p class="route-here">You are here.</p>'; }
		var bits = (meta(s) ? [esc(meta(s))] : []).concat(warnings(s).map(function(w) { return '<span class="route-warn ' + w.cls + '">' + esc(w.text) + "</span>"; }));
		return strip(r) + (bits.length ? '<p class="route-meta">' + bits.join(" · ") + "</p>" : "");
	}
	// Where to dock, or which signature to warp to and how long it has. One
	// line: the rest (other stations, other holes from the same system) is in
	// the tooltip.
	function where(p) {
		var list = p.stations.length ? p.stations.map(function(st) { return {text: st.name, full: st.name}; }) : p.ways.map(function(w) {
			var id = sig(w.sig) || "no sig listed", left = w.hours !== null ? w.hours + "h left" : null;
			return {text: [id, left].filter(Boolean).join(" · "), full: [id, w.type, w.size, left].filter(Boolean).join(" · ")};
		});
		if (!list.length) { return ""; }
		return '<p class="route-station" data-tip="' + esc(list.map(function(x) { return x.full; }).join("<br>")) + '">' +
			'<span class="route-station-name">' + esc(list[0].text) + "</span>" + (list.length > 1 ? '<span class="route-station-more">+' + (list.length - 1) + "</span>" : "") + "</p>";
	}

	// A named destination.
	function card(p) {
		if (p.kind) { return kindCard(p); }
		var sys = systemAnalysis.analyse(p.destination), r = p.route;
		var head = '<div class="route-head">' +
			'<a class="route-name ' + esc(sys.systemTypeClass) + '" href=".?system=' + encodeURIComponent(sys.name) + '" data-system="' + p.destination + '">' + esc(sys.name) + "</a>" +
			'<span class="route-sec ' + esc(sys.systemTypeClass) + '">' + esc(sys.systemTypeName) + "</span>" +
			(r ? '<span class="route-jumps">' + r.jumps + "j</span>" : "") +
			'<span class="route-actions">' + flyButton(p) +
			'<button type="button" class="route-btn route-remove" data-tip="Remove" aria-label="Remove ' + esc(sys.name) + '">&times;</button>' +
			"</span></div>";
		return '<div class="route-card" data-destination="' + p.destination + '">' + head + (r ? detail(p) : noRoute(p)) + "</div>";
	}

	// The nearest few of a kind: a row each, with its jumps. One row is open,
	// the nearest unless the pilot opened another, and shows its route.
	function kindCard(p) {
		var k = kind(p.kind);
		var head = '<div class="route-head"><span class="route-kind">' + esc(k.label) + "</span>" +
			'<span class="route-actions"><button type="button" class="route-btn route-remove" data-tip="Remove" aria-label="Remove ' + esc(k.label) + '">&times;</button></span></div>';
		var open = p.rows.some(function(row) { return row.destination === openRow[k.key]; }) ? openRow[k.key] : (p.rows[0] && p.rows[0].destination);
		var rows = p.rows.map(function(row) {
			var sys = systemAnalysis.analyse(row.destination), isOpen = row.destination === open;
			return '<div class="route-row' + (isOpen ? " is-open" : "") + '" data-system="' + row.destination + '">' +
				'<div class="route-row-head">' +
				'<button type="button" class="route-row-toggle" aria-expanded="' + (isOpen ? "true" : "false") + '">' +
				'<span class="route-name">' + esc(sys.name) + "</span>" +
				'<span class="route-sec ' + esc(sys.systemTypeClass) + '">' + esc(sys.systemTypeName) + "</span>" +
				'<span class="route-jumps">' + row.route.jumps + "j</span></button>" +
				// The arrow's place is kept when there is no arrow, so the columns line up down the card.
				(flyButton(row) || '<span class="route-btn-space" aria-hidden="true"></span>') + "</div>" +
				(isOpen ? '<div class="route-row-body">' + detail(row) + where(row) + "</div>" : "") + "</div>";
		}).join("");
		return '<div class="route-card is-nearest" data-nearest="' + esc(k.key) + '">' + head + (rows || noRoute(p)) + "</div>";
	}

	function render() {
		var s = state(), p = prefs(), o = origin();
		renderFollow();
		var from = s.from === "system" || s.from === "manual" ? s.from : "pilot";
		$("#routes-from-" + from).prop("checked", true);
		var $pick = $("#routes-from-pick").prop("hidden", from !== "manual");
		if (from === "manual" && !$pick.is(":focus")) { $pick.val(o.fallback ? "" : systemName(o.id)); }
		$("#routes-mode").val(p.mode);
		$("#routes-ship").val(p.minShip || "");
		$("#routesWidget .route-chip[data-pref]").each(function() {
			var on = !!p[$(this).attr("data-pref")];
			$(this).toggleClass("on", on).attr("aria-pressed", on ? "true" : "false");
		});
		$("#routes-avoid-list").html(p.avoid.map(function(id) {
			return '<span class="route-avoided" data-system="' + Number(id) + '">' + esc(systemName(id)) +
				'<button type="button" class="route-unavoid" aria-label="Stop avoiding ' + esc(systemName(id)) + '">&times;</button></span>';
		}).join(""));

		$("#routes-origin").text([originText(o)].concat(prefsText(p)).join(" \u00b7 "));
		$("#routes-add-here").text("+ " + systemName(viewingSystemID)).prop("hidden", has(viewingSystemID) || Number(viewingSystemID) === o.id);

		// The kinds not yet on the list; the menu goes when all of them are.
		var left = KINDS.filter(function(k) { return !hasNearest(k.key); });
		$("#routes-nearest").prop("hidden", !left.length).html('<option value="">Nearest\u2026</option>' +
			left.map(function(k) { return '<option value="' + k.key + '">' + esc(k.label) + "</option>"; }).join(""));

		var $list = $("#routes-list");
		$list.html(planned.length ? planned.map(card).join("") : '<p class="routes-empty">Add a system, or the nearest trade hubs or loot buyers.</p>');
		hideTip();
	}

	// ---- destinations -------------------------------------------------------------

	function has(id) { return state().destinations.map(Number).indexOf(Number(id)) >= 0; }
	function addDestination(id) {
		id = Number(id);
		if (!isSystem(id) || has(id)) { return false; }
		state().destinations.push(id);
		if (tripwire.panels && !tripwire.panels.isVisible("routesWidget")) { tripwire.panels.setVisible("routesWidget", true); }
		save(); refresh(true);
		return true;
	}
	function removeDestination(id) {
		var s = state();
		s.destinations = s.destinations.filter(function(d) { return Number(d) !== Number(id); });
		if (isFollowed(id, null)) { following.stop("you removed it"); }
		save(); refresh(true);
	}
	function toggleDestination(id) { if (has(id)) { removeDestination(id); } else { addDestination(id); } }

	// The nearest of a kind ("blue", "hubs", ...), kept like a destination.
	function hasNearest(key) { return state().nearest.indexOf(key) >= 0; }
	function addNearest(key) {
		if (!kind(key) || hasNearest(key)) { return false; }
		state().nearest.push(key);
		if (kind(key).hub) { scoutAt = 0; }      // its holes are wanted now, not in a minute
		if (tripwire.panels && !tripwire.panels.isVisible("routesWidget")) { tripwire.panels.setVisible("routesWidget", true); }
		save(); refresh(true);
		return true;
	}
	function removeNearest(key) {
		var s = state();
		s.nearest = s.nearest.filter(function(k) { return k !== key; });
		if (following.current() && following.current().kind === key) { following.stop("you removed " + kind(key).label); }
		save(); refresh(true);
	}
	function toggleNearest(key) { if (hasNearest(key)) { removeNearest(key); } else { addNearest(key); } }

	function setPref(name, value) {
		state().prefs[name] = value;
		guidance.clearCache();          // the system panel's gate distances follow the same preferences
		save(); refresh(true);
	}

	// A system picked in one of the panel's two system fields.
	function picked(input, ui) {
		var id = ui && ui.item && ui.item.content && Number(ui.item.content.key);
		if (!id) {
			var typed = $.trim($(input).val()).toLowerCase(), all = tripwire.systems || appData.systems;
			id = Number(Object.keys(all).filter(function(k) { return all[k].name.toLowerCase() === typed; })[0]) || null;
		}
		return id && isSystem(id) ? id : null;
	}

	// ---- wiring ---------------------------------------------------------------------

	$(function() {
		var $w = $("#routesWidget");
		if (!$w.length) { return; }
		state();

		$w.on("change", "input[name='routes-from']", function() {
			state().from = this.value === "system" || this.value === "manual" ? this.value : "pilot";
			save(); refresh(true);
			if (this.value === "manual") { $("#routes-from-pick").trigger("focus").trigger("select"); }
		});
		// The start system, typed: pick from the list, or type a name and press Enter.
		function startFrom(id) { state().fromSystem = id; save(); $("#routes-from-pick").trigger("blur"); refresh(true); }
		$w.on("inlinecompleteselect", "#routes-from-pick", function(e, ui) { e.preventDefault(); var id = picked(this, ui); if (id) { $(this).val(systemName(id)); startFrom(id); } });
		$w.on("keydown", "#routes-from-pick", function(e) { if (e.key !== "Enter") { return; } var id = picked(this, null); if (id) { e.preventDefault(); startFrom(id); } });
		$w.on("change", "#routes-mode", function() { setPref("mode", this.value); });
		$w.on("change", "#routes-ship", function() { setPref("minShip", this.value || null); });
		$w.on("click", ".route-chip[data-pref]", function() {
			var n = $(this).attr("data-pref");
			if (n === "scout") { scoutAt = 0; }     // asked for now: do not wait out the minute
			setPref(n, !prefs()[n]);
		});

		// The preferences sit behind the cog: the row this panel shares is short,
		// and the line under it says what they are. Open or closed is remembered
		// in this browser.
		function showPrefs(open) {
			$("#routes-prefs").prop("hidden", !open);
			$("#routes-prefs-toggle").attr("aria-expanded", open ? "true" : "false").toggleClass("active", open);
		}
		$w.on("mouseenter focusin", "[data-tip]", function() { showTip(this); });
		$w.on("mouseleave focusout click", "[data-tip]", hideTip);
		$w.on("click", "#routes-prefs-toggle", function() {
			if (window.Tooltips) { Tooltips.close(); }      // or it sits over the controls it just opened
			var open = $("#routes-prefs").prop("hidden");
			showPrefs(open);
			try { localStorage.setItem("tripwire.routes.prefsOpen", open ? "1" : "0"); } catch (e) {}
		});
		try { showPrefs(localStorage.getItem("tripwire.routes.prefsOpen") === "1"); } catch (e) { showPrefs(false); }

		// Destinations: pick from the list, or type a name and press Enter.
		$w.on("inlinecompleteselect", "#routes-add", function(e, ui) {
			e.preventDefault();
			var id = picked(this, ui);
			if (id) { addDestination(id); $(this).val(""); }
		});
		$w.on("keydown", "#routes-add", function(e) {
			if (e.key !== "Enter") { return; }
			var id = picked(this, null);
			if (id) { e.preventDefault(); addDestination(id); $(this).val(""); }
		});
		$w.on("click", "#routes-add-here", function() { addDestination(viewingSystemID); });
		$w.on("change", "#routes-nearest", function() { if (this.value) { addNearest(this.value); } });
		$w.on("click", ".route-remove", function() {
			var $card = $(this).closest(".route-card"), key = $card.attr("data-nearest");
			if (key) { removeNearest(key); } else { removeDestination($card.attr("data-destination")); }
		});
		$w.on("click", ".route-use-scout", function() { scoutAt = 0; setPref("scout", true); });
		$w.on("click", ".route-row-toggle", function() {
			var $row = $(this).closest(".route-row");
			openRow[$row.closest(".route-card").attr("data-nearest")] = Number($row.attr("data-system"));
			render();
		});

		// Avoided systems.
		function avoid(id) { var a = state().prefs.avoid.map(Number); if (a.indexOf(id) < 0) { a.push(id); setPref("avoid", a); } }
		$w.on("inlinecompleteselect", "#routes-avoid-add", function(e, ui) { e.preventDefault(); var id = picked(this, ui); if (id) { avoid(id); $(this).val(""); } });
		$w.on("keydown", "#routes-avoid-add", function(e) { if (e.key !== "Enter") { return; } var id = picked(this, null); if (id) { e.preventDefault(); avoid(id); $(this).val(""); } });
		$w.on("click", ".route-unavoid", function() {
			var id = Number($(this).closest(".route-avoided").attr("data-system"));
			setPref("avoid", state().prefs.avoid.map(Number).filter(function(a) { return a !== id; }));
		});

		// A hop or a destination's name shows that system; the arrow sets the in-game destination.
		function view(e) {
			if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") { return; }
			e.preventDefault();
			tripwire.systemChange(Number($(this).attr("data-system")));
		}
		$w.on("click", ".route-hop", view);
		$w.on("click", "a.route-name", view);
		$w.on("click", "button.route-fly", function() {
			var $row = $(this).closest(".route-row"), $card = $(this).closest(".route-card"), p;
			if ($row.length) {
				p = planned.filter(function(c) { return c.kind === $card.attr("data-nearest"); })[0];
				p = p && p.rows.filter(function(row) { return row.destination === Number($row.attr("data-system")); })[0];
			} else { p = planned.filter(function(c) { return !c.kind && c.destination === Number($card.attr("data-destination")); })[0]; }
			if (p) { fly(p); }
		});
		$w.on("click", ".routes-follow-stop", function() { stopFollowing(""); });
		$w.on("click", ".routes-follow-dismiss", function() { say(null); });

		refresh(true);
		setInterval(function() { following.step(); if (!document.hidden) { refresh(false); } }, TICK);
		$(document).on("panels:layout", function() { refresh(false); });
	});

	return {
		refresh: refresh, has: has, addDestination: addDestination, removeDestination: removeDestination, toggleDestination: toggleDestination,
		kinds: function() { return KINDS.slice(); }, hasNearest: hasNearest, addNearest: addNearest, removeNearest: removeNearest, toggleNearest: toggleNearest,
		routes: function() { return planned.slice(); }, origin: origin,
		// The tracked pilot's location came in (tripwire.EVE).
		located: function() { following.step(); },
		stopFollowing: stopFollowing, following: function() { return following.current(); },
		// For tests: plan against this map instead of the page's (null to go back).
		useSource: function(s) { source = s || null; refresh(true); }
	};
})();
