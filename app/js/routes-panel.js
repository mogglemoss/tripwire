// The Routes panel: saved destinations, each with the route to it from the
// tracked pilot (or the viewed system), across gates, this mask's chain and,
// if asked, EVE-Scout's holes. The layout follows Aperture's route planner:
// where from, how safe, what ship, holes to leave out, then one card per
// destination with its hops as a strip.
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

	// ---- state ----------------------------------------------------------------

	function state() {
		if (!options.routes) { options.routes = {from: "pilot", destinations: []}; }
		var r = options.routes;
		if (!Array.isArray(r.destinations)) { r.destinations = []; }
		if (!r.prefs || !r.prefs.mode) {
			// First time: the two older settings, in the new terms.
			r.prefs = tripwire.route.prefsFromLegacy(options.chain);
			guidance.clearCache();
		}
		if (!Array.isArray(r.prefs.avoid)) { r.prefs.avoid = []; }
		return r;
	}
	function prefs() { return routeEngine.withDefaults(state().prefs); }
	function save() { options.saveDelay(600); }

	function systemName(id) { return (tripwire.systems || appData.systems)[id] ? (tripwire.systems || appData.systems)[id].name : String(id); }
	function isSystem(id) { return !!(tripwire.systems || appData.systems)[id]; }

	// The tracked pilot's system, when one is tracked and located.
	function pilotSystem() {
		var eve = tripwire.client && tripwire.client.EVE;
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
	function refreshScout() {
		if (!prefs().scout || scoutPending || Date.now() - scoutAt < SCOUT_EVERY) { return; }
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

	// Everything a route depends on, as one string.
	function key() {
		var s = state(), o = origin(), src = mapSource();
		var holes = tripwire.route.holes(src).map(function(h) { return [h.id, h.a, h.b, h.life, h.mass, h.size, h.unscanned ? 1 : 0].join(":"); }).join("|");
		var scout = prefs().scout ? tripwire.route.scout(src).map(function(h) { return h.id + ":" + h.remainingHours; }).join("|") : "";
		return JSON.stringify([o.id, o.fallback ? 1 : 0, s.from, s.fromSystem || 0, s.prefs, s.destinations, Number(viewingSystemID)]) + "#" + holes + "#" + scout +
			"#" + ($("#routesWidget").hasClass("panel-hidden") ? 0 : 1);
	}

	function compute() {
		var o = origin(), p = prefs(), src = mapSource();
		planned = state().destinations.map(function(dest) {
			var route = tripwire.route.plan(o.id, dest, p, src);
			return {destination: Number(dest), route: route, summary: route ? tripwire.route.summary(route, src) : null,
				waypoint: route ? tripwire.route.waypoint(route) : null};
		});
		return planned;
	}

	function refresh(force) {
		if (!document.getElementById("routesWidget")) { return; }
		refreshScout();
		var k = key();
		if (!force && k === lastKey) { return; }
		lastKey = k;
		compute();
		render();
	}

	// ---- render -----------------------------------------------------------------

	function esc(s) { return _.escape(String(s === null || s === undefined ? "" : s)); }
	// "abc123" as Tripwire stores it, or "ABC-123" as EVE-Scout sends it: ABC-123 either way.
	function sig(id) {
		var s = String(id || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
		return s ? s.substring(0, 3) + (s.length >= 6 ? "-" + s.substring(3, 6) : "") : null;
	}
	function secText(sys) { return sys.class ? sys.systemTypeName : sys.systemTypeName + " " + Number(sys.baseSecurity).toFixed(2); }

	// What to say about the jump into a system.
	function hopText(step, fromID) {
		if (step.via === "gate") { return "gate"; }
		var h = step.hole, near = h.a === fromID ? h.sigA : h.sigB, far = h.a === fromID ? h.sigB : h.sigA;
		if (step.via === "eve_scout") { return "EVE-Scout hole" + (near ? " " + sig(near) : "") + (h.remainingHours !== null ? ", " + h.remainingHours + "h left" : ""); }
		var bits = ["wormhole" + (near ? " " + sig(near) : "") + (far ? " › " + sig(far) : "")];
		if (h.type && !/^\?+$/.test(h.type)) { bits.push(h.type); }
		if (h.life === "eol") { bits.push("EOL"); } else if (h.life === "last_hour") { bits.push("under 1h"); }
		if (h.mass === "critical") { bits.push("mass critical"); } else if (h.mass === "reduced") { bits.push("mass reduced"); }
		if (h.unscanned) { bits.push("not scanned"); }
		return bits.join(", ");
	}
	function flagged(step) {
		var h = step.hole;
		return step.via === "wh" && (h.life !== "stable" || h.mass === "critical" || h.unscanned);
	}

	function hop(id, title, extra) {
		var sys = systemAnalysis.analyse(id);
		return '<span class="route-hop ' + esc(sys.systemTypeClass) + (sys.class ? " is-j" : "") + (extra || "") + '" data-system="' + id + '" ' +
			'data-tooltip="' + esc(sys.name + " (" + secText(sys) + ") · " + title) + '"></span>';
	}

	function strip(route) {
		var out = hop(route.from, "start", " is-origin"), prev = route.from;
		route.steps.forEach(function(step) {
			if (step.via !== "gate") {
				out += '<i class="route-link is-' + (step.via === "wh" ? "wh" : "scout") + (flagged(step) ? " is-flagged" : "") + (step.via === "wh" && step.hole.unscanned ? " is-unscanned" : "") + '" aria-hidden="true"></i>';
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
		var skip = [p.skipEol && "EOL", p.skipCrit && !p.skipReduced && "crit", p.skipReduced && "reduced mass", p.skipUnscanned && "unscanned"].filter(Boolean);
		if (skip.length) { bits.push("skipping " + skip.join(", ")); }
		if (p.scout) { bits.push(scoutFailed && !scoutLinks().length ? "EVE-Scout not loading" : "with EVE-Scout"); }
		if (p.avoid.length) { bits.push("avoiding " + p.avoid.length); }
		return bits;
	}

	function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

	function meta(s) {
		var bits = [];
		if (s.holes) { bits.push(plural(s.holes, "wormhole", "wormholes")); }
		if (s.low) { bits.push(s.low + " low-sec"); }
		if (s.nullsec) { bits.push(s.nullsec + " null-sec"); }
		if (s.jspace) { bits.push(s.jspace + " J-space"); }
		return bits.join(" · ");
	}
	function warnings(s) {
		var bits = [];
		if (s.unscanned) { bits.push(plural(s.unscanned, "unscanned hole", "unscanned holes")); }
		if (s.eol) { bits.push(plural(s.eol, "hole", "holes") + " at end of life"); }
		if (s.crit) { bits.push(plural(s.crit, "hole", "holes") + " at critical mass"); }
		return bits.join(" · ");
	}

	function card(p) {
		var sys = systemAnalysis.analyse(p.destination), r = p.route, s = p.summary;
		var canFly = r && p.waypoint && tripwire.esi && tripwire.esi.characters && tripwire.esi.characters[options.tracking.active];
		var head = '<div class="route-head">' +
			'<a class="route-name ' + esc(sys.systemTypeClass) + '" href=".?system=' + encodeURIComponent(sys.name) + '" data-system="' + p.destination + '">' + esc(sys.name) + "</a>" +
			'<span class="route-sec ' + esc(sys.systemTypeClass) + '">' + esc(sys.systemTypeName) + "</span>" +
			(r ? '<span class="route-jumps">' + r.jumps + "j</span>" : "") +
			'<span class="route-actions">' +
			(canFly ? '<button type="button" class="route-btn route-fly" data-waypoint="' + p.waypoint + '" data-tooltip="Set in-game destination: ' + esc(systemName(p.waypoint)) +
				(p.waypoint !== p.destination ? " (where the gates end)" : "") + '" aria-label="Set in-game destination to ' + esc(systemName(p.waypoint)) + '"><svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg></button>' : "") +
			'<button type="button" class="route-btn route-remove" data-tooltip="Remove" aria-label="Remove ' + esc(sys.name) + '">&times;</button>' +
			"</span></div>";
		var body;
		if (!r) { body = '<p class="route-none">No route with these preferences.</p>'; }
		else if (!r.jumps) { body = '<p class="route-here">You are here.</p>'; }
		else {
			var w = warnings(s), m = meta(s);
			body = strip(r) + (m ? '<p class="route-meta">' + esc(m) + "</p>" : "") + (w ? '<p class="route-warn">' + esc(w) + "</p>" : "");
		}
		return '<div class="route-card" data-destination="' + p.destination + '">' + head + body + "</div>";
	}

	function render() {
		var s = state(), p = prefs(), o = origin();
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

		var $list = $("#routes-list");
		$list.html(planned.length ? planned.map(card).join("") : '<p class="routes-empty">Add a destination to plan a route.</p>');
		if (window.Tooltips) { Tooltips.attach($("#routes-list [data-tooltip]")); }
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
		save(); refresh(true);
	}
	function toggleDestination(id) { if (has(id)) { removeDestination(id); } else { addDestination(id); } }

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
		$w.on("click", "#routes-prefs-toggle", function() {
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
		$w.on("click", ".route-remove", function() { removeDestination($(this).closest(".route-card").attr("data-destination")); });

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
		$w.on("click", ".route-name", view);
		$w.on("click", ".route-fly", function() {
			tripwire.esi.setDestination(Number($(this).attr("data-waypoint")), options.tracking.active, true);
		});

		refresh(true);
		setInterval(function() { if (!document.hidden) { refresh(false); } }, TICK);
		$(document).on("panels:layout", function() { refresh(false); });
	});

	return {
		refresh: refresh, has: has, addDestination: addDestination, removeDestination: removeDestination, toggleDestination: toggleDestination,
		routes: function() { return planned.slice(); }, origin: origin,
		// For tests: plan against this map instead of the page's (null to go back).
		useSource: function(s) { source = s || null; refresh(true); }
	};
})();
