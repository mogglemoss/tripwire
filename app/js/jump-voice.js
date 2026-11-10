// Spoken announcements when the tracked pilot jumps into wormhole space.
//
// The tracked location is polled in the browser, and tripwire.EVE() sees a
// jump before the auto-mapper sends anything, so "new to the map" is read
// from the map as it stood before this jump. The first line (class,
// digits, statics) is spoken at once; kills, who has been killing and any
// Thera or Turnur connection follow as their data arrives.
//
// Live kills: while announcements are on, the pilot's current wormhole
// system's last hour is checked on zKillboard once a minute, through the
// kill stream's shared fetcher, and a kill filed since is announced. One
// small request for one system, rather than walking all of New Eden's feed.
tripwire.jumpVoice = (function() {
	"use strict";
	var T = tripwire.voiceText;
	var KILL_HOURS = 8, FETCH_WAIT = 8000, LIVE_MS = 60 * 1000;
	var corpNames = {}, live = {systemID: null, seen: null, timer: null};

	function settings() { return (typeof options !== "undefined" && options.voice) || {}; }
	function part(name, s) { s = s || settings(); return !s.parts || s.parts[name] !== false; }
	function speakOpts(s) { s = s || settings(); return {voiceKey: s.voiceKey, rate: s.rate, volume: s.volume}; }
	function say(text, s) { return text ? tripwire.speech.say(text, speakOpts(s)) : Promise.resolve(); }

	function hullName(typeID) {
		var t = appData.mass && appData.mass[typeID];
		return t && t.typeName ? t.typeName : null;
	}

	function isWormhole(systemID) {
		var r = systemAnalysis.analyse(systemID);
		return !!(r && r.class);
	}

	// Resolves within `ms` either way, so a slow source never holds up the voice.
	function within(promise, ms) {
		return Promise.race([promise, new Promise(function(resolve) { setTimeout(function() { resolve(null); }, ms); })])
			.catch(function(e) { console.warn("Voice: a source did not answer", e); return null; });
	}

	function corpName(id) {
		if (corpNames[id]) { return Promise.resolve(corpNames[id]); }
		return fetch("https://esi.evetech.net/latest/universe/names/?datasource=tranquility", {
			method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify([id])
		}).then(function(r) { if (!r.ok) { throw new Error("ESI names " + r.status); } return r.json(); })
			.then(function(list) { var hit = (list || [])[0]; if (hit && hit.name) { corpNames[id] = hit.name; } return corpNames[id] || null; });
	}

	function hubLinks() {
		return $.ajax({url: "cached_third_party.php?key=eve-scout-signatures", dataType: "JSON"}).then(function(d) { return d; });
	}

	// The lines for a system, in speaking order. The first is immediate.
	function announce(systemID, s, now) {
		s = s || settings();
		now = now || Date.now();
		var system = systemAnalysis.analyse(systemID);
		var first = [];
		if (part("arrival", s)) { first.push(T.arrival(system)); }
		if (part("digits", s)) { first.push(T.digits(system)); }
		if (part("statics", s)) { first.push(T.statics(system, appData.wormholes)); }
		var spoken = say(first.filter(Boolean).join(" "), s);

		// Both lookups start now; their lines are spoken in a fixed order,
		// kills before connections, whichever answers first.
		var killsLine = (part("kills", s) || part("who", s)) ? within(tripwire.killStream.kills(systemID), FETCH_WAIT).then(function(list) {
			if (!list) { return null; }
			var lines = [part("kills", s) ? T.kills(list, KILL_HOURS, now, hullName) : null];
			var counts = part("who", s) ? T.whoCounts(list) : null;
			return (counts ? within(corpName(counts.corporationID), FETCH_WAIT) : Promise.resolve(null)).then(function(name) {
				lines.push(T.who(counts, name));
				return lines.filter(Boolean).join(" ");
			});
		}) : Promise.resolve(null);
		var hubsLine = part("hubs", s) ? within(hubLinks(), FETCH_WAIT).then(function(links) { return T.hubLinks(links, systemID); }) : Promise.resolve(null);

		return killsLine.then(function(text) { if (text) { say(text, s); } return hubsLine; })
			.then(function(text) { if (text) { say(text, s); } return spoken; });
	}

	// ── live kills in the current system ────────────────────────────────
	function stopLive() { clearTimeout(live.timer); live.timer = null; live.systemID = null; live.seen = null; }

	function pollLive(fresh) {
		var s = settings(), systemID = live.systemID;
		if (!s.enabled || !part("live", s) || !systemID) { return stopLive(); }
		tripwire.killStream.recent(systemID, fresh)
			.then(function(list) {
				if (live.systemID !== systemID || !Array.isArray(list)) { return; }
				if (!live.seen) {   // the first look only learns what is already there
					live.seen = {};
					list.forEach(function(k) { live.seen[k.killmail_id] = true; });
					return;
				}
				list.filter(function(k) { return !live.seen[k.killmail_id]; }).forEach(function(k) {
					live.seen[k.killmail_id] = true;
					say(T.liveKill(k, hullName), s);
				});
			})
			.catch(function(e) { console.warn("Voice: live kills check failed", e); })
			.then(function() { if (live.systemID === systemID) { live.timer = setTimeout(pollLive, LIVE_MS); } });
	}

	function watch(systemID) {
		var s = settings();
		if (!s.enabled || !part("live", s) || !systemID || !isWormhole(systemID)) { return stopLive(); }
		if (live.systemID === Number(systemID)) { return; }
		stopLive();
		live.systemID = Number(systemID);
		pollLive();
	}

	// ── the jump ────────────────────────────────────────────────────────
	// Called by tripwire.EVE() when the tracked pilot changes system, before
	// the auto-mapper runs.
	function arrived(fromID, toID) {
		var s = settings();
		if (!s.enabled || !toID || fromID == toID) { return; }
		watch(toID);
		if (!isWormhole(toID)) { return; }
		if (s.trigger !== "all") {
			var mapped = T.mappedSystems(tripwire.client && tripwire.client.signatures, tripwire.client && tripwire.client.wormholes);
			if (mapped[Number(toID)]) { return; }
		}
		tripwire.speech.cancel();   // a new system makes the last one's lines stale
		announce(toID, s);
	}

	// ── squelch and volume ──────────────────────────────────────────────
	// The header switch is a radio squelch: "Squelch" while the voice is on
	// (press to silence it), "Squelched" while it is off. The volume slider
	// beside it shows while the voice is on.
	function paint() {
		var s = settings(), on = s.enabled === true, st = tripwire.speech.status();
		var waiting = on && (st.browser === "waiting" || !tripwire.speech.interacted());
		var label = !tripwire.speech.supported() ? "Voice is not available in this browser"
			: on ? (waiting ? "Squelch: voice on, starting after your first click" : "Squelch: voice on") : "Squelched: voice off";
		$("#voice-toggle").toggleClass("active", on).toggleClass("is-waiting", waiting)
			.attr({"aria-pressed": String(on), "aria-label": label, "data-tooltip": label});
		$("#voice-volume").prop("hidden", !on).val(s.volume == null ? 0.8 : s.volume);
	}

	function setEnabled(on) {
		options.voice.enabled = !!on;
		if (!on) { tripwire.speech.cancel(); stopLive(); }
		else if (tripwire.client && tripwire.client.EVE) { watch(tripwire.client.EVE.systemID); }
		paint();
		options.save();
	}

	function setVolume(v) {
		options.voice.volume = Math.min(1, Math.max(0, Number(v)));
		options.saveDelay(1000);   // saved once the pilot stops dragging
	}

	$(function() {
		paint();
		$("#voice-toggle").on("click", function() { setEnabled(!settings().enabled); });
		$("#voice-volume").on("input change", function() { setVolume(this.value); });
		$(document).on("tripwire:voice-status", paint);
		// The first interaction lifts the browser's hold on speech.
		["pointerdown", "keydown"].forEach(function(type) {
			document.addEventListener(type, function once() { document.removeEventListener(type, once, true); setTimeout(paint, 0); }, true);
		});
	});

	return {arrived: arrived, announce: announce, watch: watch, setEnabled: setEnabled, setVolume: setVolume, paint: paint,
		_live: function() { return {systemID: live.systemID, seen: live.seen && Object.keys(live.seen).length}; },
		_pollLive: function() { clearTimeout(live.timer); pollLive(true); }};
})();
