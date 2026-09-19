// Wormhole life and mass, said the way the EVE client says them.
//
// Since the Legion update (September 2025) the client's wormhole window no
// longer needs decoding: Reliable Lifetime reads "less than 1 day", "less
// than 4 hours", "less than 1 hour" and, since March 2026, "Expired"; mass
// reads more than 50%, less than 50%, less than 10%. Tripwire's database
// keeps only stable/critical for life, but every signature carries an
// expiry, so the finer states are the expiry: a preset sets it, and the
// state shown is read back from it -- so a hole moves down the ladder on
// its own as time passes. No schema change. The expiry trick is Squizz's
// (squizzlabs/tripwire 0c29fa2), extended to the client's full ladder.
//
// Every place that names these states -- the dialog, the inline editor,
// the palette, the table, the legend, the automapper's match dialog --
// reads from here.
tripwire.wormholeState = (function() {
	"use strict";

	// hours: what the server sets the expiry to. -1 = the natural expiry
	// (scan time + the type's lifetime); 24 = no later than a day from now;
	// 4 / 1 = that many hours from now; 0 = now.
	var LIFE = [
		{value: "stable",    label: "Stable",  cls: "stable",   life: "stable",   hours: -1},
		{value: "day",       label: "<1d",     cls: "destab",   life: "stable",   hours: 24},
		{value: "critical4", label: "<4h",     cls: "critical", life: "critical", hours: 4},
		{value: "critical1", label: "<1h",     cls: "critical", life: "critical", hours: 1},
		{value: "expired",   label: "Expired", cls: "critical", life: "critical", hours: 0}
	];
	var MASS = [
		{value: "stable",   label: "Stable", cls: "stable"},
		{value: "destab",   label: "<50%",   cls: "destab"},
		{value: "critical", label: "<10%",   cls: "critical"}
	];

	function byValue(list, value) {
		for (var i = 0; i < list.length; i++) { if (list[i].value === value) { return list[i]; } }
		return null;
	}

	// Server time as of the last sync, advanced by the time since; the sync
	// stamp alone is a few seconds stale, enough to read "now" as "not yet".
	function now() {
		var st = (typeof tripwire !== "undefined") && tripwire.serverTime;
		if (st && st.time) {
			var elapsed = st.syncedAt ? Date.now() - st.syncedAt : 0;
			return new Date(new Date(st.time).getTime() + Math.max(0, elapsed));
		}
		return new Date();
	}

	// Seconds until the signature's expiry, or null when unknown. Expiries are
	// "YYYY-MM-DD HH:MM:SS" in UTC.
	function remainingSeconds(signature, at) {
		if (!signature || !signature.lifeLeft) { return null; }
		var until = (typeof moment !== "undefined") ? moment.utc(signature.lifeLeft).toDate() : new Date(signature.lifeLeft.replace(" ", "T") + "Z");
		if (isNaN(until.getTime())) { return null; }
		return (until.getTime() - (at || now()).getTime()) / 1000;
	}

	// The life state a wormhole is in, read from its life and its expiry.
	function lifeState(wormhole, signature, at) {
		var left = remainingSeconds(signature, at);
		if (!wormhole || wormhole.life !== "critical") {
			if (left !== null && left <= 0)     { return byValue(LIFE, "expired"); }
			if (left !== null && left <= 86400) { return byValue(LIFE, "day"); }
			return byValue(LIFE, "stable");
		}
		if (left === null)  { return byValue(LIFE, "critical4"); }
		if (left <= 0)      { return byValue(LIFE, "expired"); }
		if (left <= 3600)   { return byValue(LIFE, "critical1"); }
		return byValue(LIFE, "critical4");
	}

	function massState(wormhole) {
		return byValue(MASS, wormhole && wormhole.mass) || MASS[0];
	}

	// What to send for a chosen life preset.
	function lifeChanges(preset) {
		var p = byValue(LIFE, preset) || LIFE[0];
		return {life: p.life, lifeHours: p.hours};
	}

	return {
		LIFE: LIFE, MASS: MASS,
		lifeState: lifeState, massState: massState, lifeChanges: lifeChanges,
		presetFor: function(wormhole, signature, at) { return lifeState(wormhole, signature, at).value; },
		remainingSeconds: remainingSeconds
	};
})();

// The table's life cells follow the clock: a hole that crosses an hour left
// says so without anyone editing it.
$(function() {
	if (typeof tripwire === "undefined" || !tripwire.wormholeState) { return; }
	setInterval(function() {
		if (!tripwire.client || !tripwire.client.signatures || !tripwire.signaturePayload) { return; }
		$("#sigTable tbody tr[data-id]").each(function() {
			var $tr = $(this), sig = tripwire.client.signatures[$tr.data("id")];
			if (!sig || sig.type !== "wormhole") { return; }
			var wh = tripwire.signaturePayload.wormholeForSignature(sig.id);
			if (!wh) { return; }
			var $td = $tr.children("td").eq(4);
			if ($td.length < 1 || $tr.children("td").length < 6) { return; }
			var state = tripwire.wormholeState.lifeState(wh, sig);
			if ($td.text() !== state.label) {
				$td.text(state.label).removeClass("stable destab critical").addClass(state.cls);
			}
		});
	}, 60000);
});
