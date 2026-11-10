// The voice's engine: the browser's own speech, or ElevenLabs with the
// pilot's own key. Adapted from Corvus (corvus.observance.app).
//
// The browser's speech API has known defects, each met here: voices load
// late, Android ignores a chosen voice unless its language is set too, an
// utterance's end event is not guaranteed in a background tab (so every
// line has a deadline), and nothing may be spoken until the pilot has
// interacted with the page.
//
// ElevenLabs is called from the browser directly. The key, voice and model
// live in this browser's storage only -- never in Tripwire's saved
// settings, which go to the server -- and the key is sent to ElevenLabs and
// nowhere else. Clips are cached by voice, model, speed and text, so the
// same line is paid for once. Any failure falls back to the browser voice.
tripwire.speech = (function() {
	"use strict";

	var STUDIO_KEY = "tripwire.voice.studio";
	var API = "https://api.elevenlabs.io/v1";
	var DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb";   // ElevenLabs' stock "George"
	var MODELS = ["eleven_flash_v2_5", "eleven_multilingual_v2"];
	var CACHE_CAP = 300;
	var SEP = "||";

	function supported() {
		return typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance !== "undefined";
	}

	// ── browser voices ──────────────────────────────────────────────────
	var voiceList = [];
	function refreshVoices() {
		if (!supported()) { return; }
		var v = window.speechSynthesis.getVoices();
		if (v && v.length) { voiceList = v; $(document).trigger("tripwire:voices"); }
	}
	if (supported()) {
		refreshVoices();
		if (window.speechSynthesis.addEventListener) { window.speechSynthesis.addEventListener("voiceschanged", refreshVoices); }
	}

	// Android hands out several voices with one voiceURI, so a voice is
	// named by URI, name, language and which duplicate it is.
	function voiceKey(v, all) {
		all = all || voiceList;
		var ordinal = all.slice(0, all.indexOf(v)).filter(function(o) {
			return o.voiceURI === v.voiceURI && o.name === v.name && o.lang === v.lang;
		}).length;
		return [v.voiceURI, v.name, v.lang, String(ordinal)].join(SEP);
	}

	function pickVoice(saved, list) {
		list = list || voiceList;
		if (!list.length) { refreshVoices(); list = voiceList; }
		if (!list.length) { return null; }
		if (saved) {
			var p = String(saved).split(SEP);
			var exact = list.filter(function(v) { return v.voiceURI === p[0] && v.name === p[1] && v.lang === p[2]; });
			if (exact.length) { return exact[Number(p[3])] || exact[0]; }
			var loose = list.find(function(v) { return v.name === p[1] && v.lang === p[2]; }) ||
				list.find(function(v) { return v.voiceURI === p[0]; });
			if (loose) { return loose; }
		}
		return list.find(function(v) { return v.lang === "en-GB"; }) ||
			list.find(function(v) { return /^en/.test(v.lang); }) || list[0];
	}

	// ── the studio settings: this browser only ──────────────────────────
	function studio() {
		var s = {};
		try { s = JSON.parse(localStorage.getItem(STUDIO_KEY) || "{}") || {}; } catch (e) { s = {}; }
		return {
			engine: s.engine === "elevenlabs" ? "elevenlabs" : "browser",
			key: typeof s.key === "string" ? s.key : "",
			voiceId: s.voiceId || DEFAULT_VOICE,
			model: MODELS.indexOf(s.model) >= 0 ? s.model : MODELS[0]
		};
	}
	function saveStudio(patch) {
		var next = Object.assign(studio(), patch || {});
		try { localStorage.setItem(STUDIO_KEY, JSON.stringify(next)); } catch (e) { console.warn("Voice: this browser refused to store the ElevenLabs settings", e); }
		return next;
	}

	// ── ElevenLabs ──────────────────────────────────────────────────────
	// The API accepts a speed of 0.7 to 1.2.
	function speedFor(rate) { return Math.min(1.2, Math.max(0.7, Math.round((Number(rate) || 1) * 100) / 100)); }

	function requestFor(text, o) {
		return {
			url: API + "/text-to-speech/" + encodeURIComponent(o.voiceId) + "?output_format=mp3_44100_64",
			headers: {"xi-api-key": o.key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
			body: JSON.stringify({text: text, model_id: o.model, voice_settings: {stability: 0.5, similarity_boost: 0.75, style: 0, speed: o.speed}})
		};
	}

	// What went wrong, in terms the settings can show.
	function classify(status, body) {
		if (status === 401) { return "bad-key"; }
		if (status === 402) { return "quota"; }
		if (status === 429) { return "rate-limited"; }
		var detail = body && body.detail && body.detail.status ? String(body.detail.status) : "";
		if (/quota|exceeded|character_limit/i.test(detail)) { return "quota"; }
		return "other";
	}

	function failure(kind) { var e = new Error(kind); e.kind = kind; return e; }

	function sha256(s) {
		if (window.crypto && window.crypto.subtle && window.TextEncoder) {
			return window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(function(buf) {
				return Array.prototype.map.call(new Uint8Array(buf), function(b) { return ("0" + b.toString(16)).slice(-2); }).join("");
			});
		}
		var h = 5381;
		for (var i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) | 0; }
		return Promise.resolve("djb2-" + (h >>> 0).toString(16) + "-" + s.length);
	}

	// Clips in IndexedDB where it is allowed, in memory regardless.
	var memory = {}, dbPromise = null;
	function openDb() {
		if (dbPromise) { return dbPromise; }
		dbPromise = new Promise(function(resolve) {
			try {
				if (!window.indexedDB) { return resolve(null); }
				var req = indexedDB.open("tripwire-voice", 1);
				req.onupgradeneeded = function() { req.result.createObjectStore("clips", {keyPath: "key"}).createIndex("at", "at"); };
				req.onsuccess = function() { resolve(req.result); };
				req.onerror = function() { resolve(null); };
			} catch (e) { resolve(null); }
		});
		return dbPromise;
	}
	function cacheGet(key) {
		if (memory[key]) { return Promise.resolve(memory[key]); }
		return openDb().then(function(db) {
			if (!db) { return null; }
			return new Promise(function(resolve) {
				try {
					var req = db.transaction("clips").objectStore("clips").get(key);
					req.onsuccess = function() { resolve(req.result ? req.result.bytes : null); };
					req.onerror = function() { resolve(null); };
				} catch (e) { resolve(null); }
			});
		});
	}
	function cachePut(key, bytes) {
		memory[key] = bytes;
		return openDb().then(function(db) {
			if (!db) { return; }
			try {
				var store = db.transaction("clips", "readwrite").objectStore("clips");
				store.put({key: key, at: Date.now(), bytes: bytes});
				var count = store.count();
				count.onsuccess = function() {
					var excess = count.result - CACHE_CAP;
					if (excess <= 0) { return; }
					var cursor = store.index("at").openCursor();
					cursor.onsuccess = function() {
						var c = cursor.result;
						if (!c || excess <= 0) { return; }
						c.delete(); excess--; c.continue();
					};
				};
			} catch (e) { /* storage refused; the memory copy stands */ }
		});
	}

	var inFlight = {};
	function synthesize(text, o) {
		return sha256([o.voiceId, o.model, o.speed, text].join("|")).then(function(key) {
			return cacheGet(key).then(function(hit) {
				if (hit) { return hit; }
				if (inFlight[key]) { return inFlight[key]; }
				var req = requestFor(text, o);
				inFlight[key] = fetch(req.url, {method: "POST", headers: req.headers, body: req.body})
					.catch(function() { throw failure("network"); })
					.then(function(res) {
						if (!res.ok) { return res.json().catch(function() { return null; }).then(function(body) { throw failure(classify(res.status, body)); }); }
						return res.arrayBuffer();
					})
					.then(function(bytes) { cachePut(key, bytes); return bytes; })
					.finally(function() { delete inFlight[key]; });
				return inFlight[key];
			});
		});
	}

	// The pilot's ElevenLabs voices, for the picker.
	function listVoices(key) {
		return fetch(API + "/voices", {headers: {"xi-api-key": key}})
			.catch(function() { throw failure("network"); })
			.then(function(res) {
				if (!res.ok) { return res.json().catch(function() { return null; }).then(function(body) { throw failure(classify(res.status, body)); }); }
				return res.json();
			})
			.then(function(body) { return ((body && body.voices) || []).map(function(v) { return {id: v.voice_id, name: v.name}; }); });
	}

	// ── status, for the settings and the header button ─────────────────
	// "ok" / "idle" / a failure kind for ElevenLabs; "waiting" when the page
	// has not been interacted with yet, "blocked" when the browser refused.
	var status = {studio: "idle", browser: "ready"};
	function setStatus(part, value) {
		if (status[part] === value) { return; }
		status[part] = value;
		$(document).trigger("tripwire:voice-status", [status]);
	}

	// Speech is allowed once the page has been interacted with.
	function interacted() {
		var ua = typeof navigator !== "undefined" && navigator.userActivation;
		return !ua || ua.hasBeenActive;
	}

	// ── speaking ────────────────────────────────────────────────────────
	var generation = 0, queue = Promise.resolve(), audioCtx = null, source = null;

	function speakBrowser(text, o) {
		return new Promise(function(resolve) {
			if (!supported()) { return resolve(); }
			var u = new window.SpeechSynthesisUtterance(text);
			var voice = pickVoice(o.voiceKey);
			u.lang = voice ? voice.lang : "en-US";
			// A voice the browser no longer recognises is refused outright; the
			// language alone still gets a sensible default rather than silence.
			if (voice) { try { u.voice = voice; u.voiceURI = voice.voiceURI; } catch (e) { console.warn("Voice: the chosen voice was refused; using the default", e); } }
			u.rate = Math.min(2, Math.max(0.5, Number(o.rate) || 1));
			u.volume = Math.min(1, Math.max(0, o.volume == null ? 0.8 : Number(o.volume)));
			var done = false, deadline;
			function finish() { if (done) { return; } done = true; clearTimeout(deadline); resolve(); }
			deadline = setTimeout(finish, Math.max(8000, text.length * 90 / u.rate));
			u.onend = finish;
			u.onerror = function(e) { if (e && e.error === "not-allowed") { setStatus("browser", "blocked"); } finish(); };
			window.speechSynthesis.speak(u);
		});
	}

	// True when the studio read it (or it was cancelled); false to fall back.
	function speakStudio(text, o, s, gen) {
		return synthesize(text, {key: s.key, voiceId: s.voiceId, model: s.model, speed: speedFor(o.rate)}).then(function(bytes) {
			if (gen !== generation) { return true; }
			audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
			return (audioCtx.state === "suspended" ? audioCtx.resume() : Promise.resolve())
				.then(function() { return audioCtx.decodeAudioData(bytes.slice(0)); })
				.then(function(buf) {
					setStatus("studio", "ok");
					return new Promise(function(resolve) {
						var src = audioCtx.createBufferSource(), gain = audioCtx.createGain();
						src.buffer = buf;
						gain.gain.value = Math.min(1, Math.max(0, o.volume == null ? 0.8 : Number(o.volume)));
						src.connect(gain).connect(audioCtx.destination);
						src.onended = function() { if (source === src) { source = null; } resolve(true); };
						source = src;
						src.start();
					});
				});
		}).catch(function(e) {
			setStatus("studio", (e && e.kind) || "other");
			console.warn("Voice: ElevenLabs failed (" + ((e && e.kind) || e) + "); using the browser voice");
			return false;
		});
	}

	// Speak a line after any line already speaking. Resolves when it is
	// over, cancelled or skipped; never rejects.
	function say(text, o) {
		o = o || {};
		if (!text || !String(text).trim()) { return Promise.resolve(); }
		if (!interacted()) { setStatus("browser", "waiting"); return Promise.resolve(); }
		if (status.browser === "waiting") { setStatus("browser", "ready"); }
		var gen = generation;
		queue = queue.then(function() {
			if (gen !== generation) { return; }
			var s = studio();
			var wantStudio = s.engine === "elevenlabs" && s.key && s.voiceId;
			return (wantStudio ? speakStudio(text, o, s, gen) : Promise.resolve(false)).then(function(read) {
				if (!read && gen === generation) { return speakBrowser(text, o); }
			});
		}).catch(function(e) { console.warn("Voice: could not speak", e); });
		return queue;
	}

	function cancel() {
		generation++;
		if (supported()) { window.speechSynthesis.cancel(); }
		if (source) { try { source.stop(); } catch (e) { /* already stopped */ } source = null; }
		queue = Promise.resolve();
	}

	return {
		supported: supported, voices: function() { return voiceList.slice(); }, voiceKey: voiceKey, pickVoice: pickVoice,
		studio: studio, saveStudio: saveStudio, listVoices: listVoices, MODELS: MODELS, DEFAULT_VOICE: DEFAULT_VOICE,
		speedFor: speedFor, requestFor: requestFor, classify: classify,
		status: function() { return Object.assign({}, status); }, interacted: interacted,
		say: say, cancel: cancel
	};
})();
