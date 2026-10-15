// Recent kills for a wormhole system, from zKillboard's Streambox.
//
// ESI's hourly activity feed covers no wormhole system, so the System
// panel's graph read "no activity" in every J-system. zKillboard records
// every player loss, and its Streambox is the board's own embed of a
// system's last eight hours of kills. In J-space the graph gives way to it;
// k-space keeps the ESI graph, where jumps and NPC kills are real.
//
// The frame is set only when the viewed system changes, so polling never
// reloads it. Its links already open in new tabs. If the board does not
// answer within a few seconds, a line says so and links out, because an
// empty frame reads as broken rather than quiet.
tripwire.killStream = (function() {
	"use strict";
	var BASE = "https://zkillboard.com";
	var FRAME_W = 440, FRAME_H = 128;   // the Streambox lays five hulls on one row at this width
	var WINDOW = 8 * 3600, CACHE_MS = 5 * 60 * 1000;
	var current = null, timer = null, counts = {}, request = 0;

	// How many kills the board has for the system in the window. The
	// Streambox cannot be read across origins, so this one small request is
	// what tells a quiet system from a broken frame, and puts the number in
	// the label. Cached per system for five minutes.
	function killCount(systemID) {
		var hit = counts[systemID];
		if (hit && Date.now() - hit.at < CACHE_MS) { return Promise.resolve(hit.n); }
		return fetch(BASE + "/api/kills/solarSystemID/" + systemID + "/pastSeconds/" + WINDOW + "/", { headers: { Accept: "application/json" } })
			.then(function(r) { if (!r.ok) { throw new Error("zKillboard " + r.status); } return r.json(); })
			.then(function(list) { var n = Array.isArray(list) ? list.length : null; counts[systemID] = { n: n, at: Date.now() }; return n; });
	}

	// The frame is drawn at a fixed width and scaled to the panel, so five
	// hulls always sit on one row whatever the column is doing.
	function fit() {
		var wrap = document.querySelector("#killStream .sys-killstream-frame");
		if (!wrap) { return; }
		var scale = Math.min(1, wrap.clientWidth / FRAME_W);
		wrap.style.setProperty("--ks-scale", String(scale));
		wrap.style.height = Math.round(FRAME_H * scale) + "px";
	}

	function isWormhole(systemID) {
		var r = systemAnalysis.analyse(systemID);
		return !!(r && r.class);
	}

	function placeLinks(wormhole) {
		var $links = $("#infoLinks");
		if (!$links.length) { return; }
		if (wormhole) {
			$links.appendTo("#killStream .sys-killstream-head").addClass("in-killstream-head").removeClass("in-legend-row");
		} else if ($("#activityGraphControls").length) {
			$links.appendTo("#activityGraphControls").addClass("in-legend-row").removeClass("in-killstream-head");
		}
	}

	function label(n) {
		// The quiet line inside the frame says "none"; the label need not say it twice.
		$("#killStreamWindow").text((n ? (n === 1 ? "1 kill" : n + " kills") + " in the past 8 hours" : "past 8 hours") + " \u00b7 zKillboard");
	}

	function loadFrame(systemID) {
		var frame = document.getElementById("killStreamFrame");
		var $block = $("#killStream"), $fallback = $block.find(".sys-killstream-fallback");
		clearTimeout(timer);
		$block.addClass("is-waiting");
		frame.onload = function() { clearTimeout(timer); $block.removeClass("is-waiting"); };
		frame.src = BASE + "/system/" + systemID + "/streambox/";
		timer = setTimeout(function() { $block.removeClass("is-waiting"); $fallback.removeClass("hidden"); }, 8000);
	}

	function show(systemID) {
		var $block = $("#killStream"), $fallback = $block.find(".sys-killstream-fallback");
		$("#killStreamLink").attr("href", BASE + "/system/" + systemID + "/");
		$fallback.addClass("hidden");
		$block.removeClass("hidden");
		fit();
		if (current === systemID) { return; }
		current = systemID;
		var mine = ++request;
		$block.removeClass("is-quiet").removeClass("is-waiting");
		label(null);
		killCount(systemID).then(function(n) {
			if (mine !== request) { return; }
			label(n);
			if (n === 0) {
				// Nothing to show: our own quiet line on the instrument, no frame.
				var frame = document.getElementById("killStreamFrame");
				if (frame.src) { frame.removeAttribute("src"); }
				$block.addClass("is-quiet");
				return;
			}
			loadFrame(systemID);
		}).catch(function() {
			if (mine !== request) { return; }
			loadFrame(systemID);   // the board will say what it can
		});
	}

	function hide() {
		clearTimeout(timer); request++;
		$("#killStream").addClass("hidden").removeClass("is-waiting").removeClass("is-quiet");
		var frame = document.getElementById("killStreamFrame");
		if (frame && frame.src) { frame.removeAttribute("src"); }
		current = null;
	}

	// Called whenever the viewed system changes.
	function refresh(systemID) {
		var wormhole = isWormhole(systemID);
		$("#infoWidget").toggleClass("is-wormhole", wormhole);
		placeLinks(wormhole);
		if (wormhole) { show(systemID); } else { hide(); }
	}

	$(function() {
		if (window.ResizeObserver) {
			var wrap = document.querySelector("#killStream .sys-killstream-frame");
			if (wrap) { new ResizeObserver(fit).observe(wrap); }
		}
		$(window).on("resize", fit);
	});

	return { refresh: refresh, isWormhole: isWormhole, killCount: killCount };
})();
