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
	var elevenLoadedFor = null, previewing = null;

	function setStatus(text) { $("#voice-status").text(text || ""); }
	function radio(name) { return $pane().find("input[name='" + name + "']:checked").val(); }
	function setRadio(name, value) { $pane().find("input[name='" + name + "'][value='" + value + "']").prop("checked", true); }
	function engine() { return radio("voice-engine") === "elevenlabs" ? "elevenlabs" : "browser"; }

	// A C2 with B274 and D382: what a jump sounds like with these settings.
	var SAMPLE = {name: "J123007", class: 2, statics: ["B274", "D382"]};
	function sampleLines(s) {
		var T = tripwire.voiceText, lines = [], brief = s.detail !== "full", now = Date.now();
		var kills = [0, 1, 2, 3].map(function(i) { return {killmail_time: new Date(now - (20 + i * 50) * 60000).toISOString(), victim: {ship_type_id: 0}}; });
		if (s.parts.arrival) { lines.push(T.arrival(SAMPLE)); }
		if (s.parts.digits) { lines.push(T.digits(SAMPLE)); }
		if (s.parts.statics) { lines.push(T.statics(SAMPLE, appData.wormholes, brief)); }
		if (s.parts.kills) { lines.push(T.kills(kills, 8, now, function() { return "Stratios"; }, brief)); }
		if (s.parts.who) { lines.push(T.who({pilots: 3}, "Hard Knocks Citizens", brief)); }
		return lines.filter(Boolean);
	}

	// The detail choice shows what it sounds like.
	function showExample() {
		var s = read(), lines = sampleLines(s);
		$("#voice-detail-example").text(lines.length ? "“" + lines.join(" ") + "”" : "");
	}

	function showEngine() {
		var eleven = engine() === "elevenlabs";
		$pane().find(".voice-eleven-only").prop("hidden", !eleven);
		$pane().find(".voice-browser-only").prop("hidden", eleven);
		if (eleven) { loadElevenVoices(); }
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

	function currentKey() { return $.trim($("#voice-eleven-key").val()) || tripwire.speech.studio().key; }

	// The account's voices, loaded once per key without a button to press.
	function loadElevenVoices() {
		var key = currentKey();
		if (!key || elevenLoadedFor === key) { return; }
		elevenLoadedFor = key;
		var keep = $("#voice-eleven-voice").val() || tripwire.speech.studio().voiceId;
		$("#voice-eleven-voice").prop("disabled", true);
		tripwire.speech.listVoices(key).then(function(list) {
			fillElevenVoices(list, keep);
			if (!list.length) { setStatus("No voices on that ElevenLabs account."); }
		}).catch(function(e) {
			elevenLoadedFor = null;
			setStatus(STATUS[(e && e.kind) || "other"]);
		}).then(function() { $("#voice-eleven-voice").prop("disabled", false); });
	}

	function showKey(st) {
		$("#voice-eleven-key").val("").attr("placeholder", st.key ? "•••••••• saved" : "Paste your key");
		$("#voice-eleven-forget").prop("hidden", !st.key);
	}

	// What the form says now, for Save and Preview.
	function read() {
		var parts = {};
		$pane().find("[data-voice-part]").each(function() { parts[$(this).attr("data-voice-part")] = this.checked; });
		return {
			enabled: $("#voice-enabled").prop("checked"),
			trigger: radio("voice-trigger") === "all" ? "all" : "new",
			detail: radio("voice-detail") === "full" ? "full" : "brief",
			parts: parts,
			voiceKey: $("#voice-choice").val() || "",
			rate: $("#voice-rate-slider").slider("value"),
			volume: $("#voice-volume-slider").slider("value")
		};
	}

	function studioFromForm() {
		var patch = {engine: engine(), voiceId: $("#voice-eleven-voice").val() || tripwire.speech.DEFAULT_VOICE, model: $("#voice-eleven-model").val()};
		var key = $.trim($("#voice-eleven-key").val());
		if (key) { patch.key = key; }
		return patch;
	}

	function render() {
		var v = options.voice || {}, st = tripwire.speech.studio();
		$("#voice-enabled").prop("checked", v.enabled === true);
		setRadio("voice-trigger", v.trigger === "all" ? "all" : "new");
		setRadio("voice-detail", v.detail === "full" ? "full" : "brief");
		$pane().find("[data-voice-part]").each(function() { this.checked = !v.parts || v.parts[$(this).attr("data-voice-part")] !== false; });
		$("#voice-rate-slider").slider("value", v.rate || 1.1);
		$("#voice-volume-slider").slider("value", v.volume == null ? 0.8 : v.volume);
		fillBrowserVoices(v.voiceKey);
		setRadio("voice-engine", st.engine);
		$("#voice-eleven-model").val(st.model);
		fillElevenVoices(null, st.voiceId);
		showKey(st);
		setStatus(tripwire.speech.supported() ? "" : "This browser has no speech; ElevenLabs can still be used.");
		showEngine();
		showExample();
		stopPreview();
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
		stopPreview();
	}

	// One button: Preview, and Stop while it speaks.
	function stopPreview() {
		previewing = null;
		tripwire.speech.cancel();
		$("#voice-preview").val("Preview");
	}
	function preview() {
		if (previewing) { return stopPreview(); }
		var s = read(), lines = sampleLines(s);
		if (!lines.length) { return setStatus("Tick something to say."); }
		tripwire.speech.saveStudio(studioFromForm());
		showKey(tripwire.speech.studio());
		setStatus("");
		tripwire.speech.cancel();
		var mine = previewing = {};
		$("#voice-preview").val("Stop");
		tripwire.speech.say(lines.join(" "), {voiceKey: s.voiceKey, rate: s.rate, volume: s.volume}).then(function() {
			if (previewing === mine) { previewing = null; $("#voice-preview").val("Preview"); }
		});
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
		$pane().on("change", "input[name='voice-engine']", showEngine);
		$pane().on("change", "input[name='voice-detail'], [data-voice-part]", showExample);
		$("#voice-preview").on("click", preview);
		$("#voice-eleven-key").on("change", function() { elevenLoadedFor = null; setStatus(""); loadElevenVoices(); });
		$("#voice-eleven-forget").on("click", function() {
			tripwire.speech.saveStudio({key: ""});
			elevenLoadedFor = null;
			showKey(tripwire.speech.studio());
			setStatus("Key removed from this browser.");
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
