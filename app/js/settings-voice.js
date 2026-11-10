// Settings > Voice. Announcement choices go to options.voice and are saved
// with the account; the ElevenLabs key, voice and model are saved in this
// browser only (tripwire.speech.saveStudio), never sent to Tripwire.
tripwire.settingsVoice = (function() {
	"use strict";
	var $pane = function() { return $("#dialog-options [data-pane=voice]"); };
	var STATUS = {
		"bad-key": "ElevenLabs refused the key.", "quota": "ElevenLabs says the account is out of credit.",
		"rate-limited": "ElevenLabs is rate limiting; using the browser voice for now.",
		"network": "Could not reach ElevenLabs.", "other": "ElevenLabs could not read that; using the browser voice."
	};

	function setStatus(text) { $("#voice-status").text(text || ""); }

	function showEngine() {
		var eleven = $("#voice-engine").val() === "elevenlabs";
		$pane().find(".voice-eleven-only").prop("hidden", !eleven);
		$pane().find(".voice-browser-only").prop("hidden", eleven);
	}

	function fillBrowserVoices(selected) {
		var $sel = $("#voice-choice").empty().append($("<option>").val("").text("Default"));
		var list = tripwire.speech.voices();
		list.forEach(function(v) { $sel.append($("<option>").val(tripwire.speech.voiceKey(v, list)).text(v.name + " (" + v.lang + ")")); });
		if (selected && !$sel.find("option").filter(function() { return this.value === selected; }).length) {
			$sel.append($("<option>").val(selected).text("Saved voice, not on this device"));
		}
		$sel.val(selected || "");
	}

	function fillElevenVoices(list, selected) {
		var $sel = $("#voice-eleven-voice").empty();
		(list || []).forEach(function(v) { $sel.append($("<option>").val(v.id).text(v.name)); });
		if (selected && !$sel.find("option").filter(function() { return this.value === selected; }).length) {
			$sel.prepend($("<option>").val(selected).text(selected === tripwire.speech.DEFAULT_VOICE ? "George (default)" : selected));
		}
		$sel.val(selected);
	}

	function keyPlaceholder(st) {
		$("#voice-eleven-key").val("").attr("placeholder", st.key ? "Saved in this browser" : "Paste your key");
		$("#voice-eleven-forget").prop("hidden", !st.key);
	}

	// What the form says now, for Save and Preview.
	function read() {
		var parts = {};
		$pane().find("[data-voice-part]").each(function() { parts[$(this).attr("data-voice-part")] = this.checked; });
		return {
			enabled: $("#voice-enabled").prop("checked"),
			trigger: $("#voice-trigger").val() === "all" ? "all" : "new",
			parts: parts,
			voiceKey: $("#voice-choice").val() || "",
			rate: $("#voice-rate-slider").slider("value"),
			volume: $("#voice-volume-slider").slider("value")
		};
	}

	function studioFromForm() {
		var patch = {engine: $("#voice-engine").val(), voiceId: $("#voice-eleven-voice").val() || tripwire.speech.DEFAULT_VOICE, model: $("#voice-eleven-model").val()};
		var key = $.trim($("#voice-eleven-key").val());
		if (key) { patch.key = key; }
		return patch;
	}

	function render() {
		var v = options.voice || {}, st = tripwire.speech.studio();
		$("#voice-enabled").prop("checked", v.enabled === true);
		$("#voice-trigger").val(v.trigger === "all" ? "all" : "new");
		$pane().find("[data-voice-part]").each(function() { this.checked = !v.parts || v.parts[$(this).attr("data-voice-part")] !== false; });
		$("#voice-rate-slider").slider("value", v.rate || 1.1);
		$("#voice-volume-slider").slider("value", v.volume == null ? 0.8 : v.volume);
		fillBrowserVoices(v.voiceKey);
		$("#voice-engine").val(st.engine);
		$("#voice-eleven-model").val(st.model);
		fillElevenVoices(null, st.voiceId);
		keyPlaceholder(st);
		showEngine();
		var supported = tripwire.speech.supported();
		setStatus(supported ? "" : "This browser has no speech; ElevenLabs can still be used.");
	}

	function save() {
		var next = read();
		tripwire.speech.saveStudio(studioFromForm());
		var wasOn = options.voice && options.voice.enabled;
		options.voice = next;
		if (wasOn && !next.enabled) { tripwire.speech.cancel(); }
		if (tripwire.jumpVoice) {
			tripwire.jumpVoice.paint();
			if (next.enabled && tripwire.client && tripwire.client.EVE) { tripwire.jumpVoice.watch(tripwire.client.EVE.systemID); }
		}
	}

	// A C2 with B274 and D382: what a jump sounds like with these settings.
	var SAMPLE = {name: "J123007", class: 2, statics: ["B274", "D382"]};
	function preview() {
		var s = read(), T = tripwire.voiceText, lines = [];
		if (s.parts.arrival) { lines.push(T.arrival(SAMPLE)); }
		if (s.parts.digits) { lines.push(T.digits(SAMPLE)); }
		if (s.parts.statics) { lines.push(T.statics(SAMPLE, appData.wormholes)); }
		if (s.parts.kills) { lines.push("4 kills in the last 8 hours, latest a Stratios, 20 minutes ago."); }
		if (s.parts.who) { lines.push("Mostly Hard Knocks Citizens, 3 pilots."); }
		if (!lines.length) { return setStatus("Tick something to say."); }
		tripwire.speech.saveStudio(studioFromForm());
		keyPlaceholder(tripwire.speech.studio());
		setStatus("");
		tripwire.speech.cancel();
		tripwire.speech.say(lines.join(" "), {voiceKey: s.voiceKey, rate: s.rate, volume: s.volume});
	}

	function setUpSlider(id, value, range) {
		$("#" + id).slider({min: range.min, max: range.max, step: range.step, value: value,
			slide: function(e, ui) { $("label[for='" + id + "']").text(range.label(ui.value)); },
			change: function(e, ui) { $("label[for='" + id + "']").text(range.label(ui.value)); }});
		$("label[for='" + id + "']").text(range.label(value));
	}

	$(function() {
		if (!$("#voice-enabled").length) { return; }
		setUpSlider("voice-rate-slider", 1.1, {min: 0.7, max: 1.6, step: 0.05, label: function(v) { return v.toFixed(2) + "×"; }});
		setUpSlider("voice-volume-slider", 0.8, {min: 0, max: 1, step: 0.05, label: function(v) { return Math.round(v * 100) + "%"; }});
		$("#voice-engine").on("change", showEngine);
		$("#voice-preview").on("click", preview);
		$("#voice-stop").on("click", function() { tripwire.speech.cancel(); });
		$("#voice-eleven-forget").on("click", function() {
			tripwire.speech.saveStudio({key: ""});
			keyPlaceholder(tripwire.speech.studio());
			setStatus("Key removed from this browser.");
		});
		$("#voice-eleven-load").on("click", function() {
			var key = $.trim($("#voice-eleven-key").val()) || tripwire.speech.studio().key;
			if (!key) { return setStatus("Paste your ElevenLabs key first."); }
			setStatus("Loading your voices...");
			tripwire.speech.listVoices(key).then(function(list) {
				fillElevenVoices(list, $("#voice-eleven-voice").val() || tripwire.speech.studio().voiceId);
				setStatus(list.length ? "" : "No voices on that account.");
			}).catch(function(e) { setStatus(STATUS[(e && e.kind) || "other"]); });
		});
		$(document).on("tripwire:voices", function() { if ($pane().is(":visible")) { fillBrowserVoices($("#voice-choice").val()); } });
		$(document).on("tripwire:voice-status", function(e, st) {
			if (!$pane().is(":visible")) { return; }
			if (st.studio && STATUS[st.studio]) { setStatus(STATUS[st.studio]); }
			else if (st.browser === "blocked") { setStatus("The browser blocked speech. Click anywhere on the page, then try again."); }
		});
	});

	return {render: render, save: save, read: read};
})();
