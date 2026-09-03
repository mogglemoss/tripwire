// Install on a phone. Chrome and Edge raise beforeinstallprompt when the
// manifest and service worker are in place; iOS Safari never does, so there
// the tip says where Add to Home Screen lives. The tip appears only on a
// phone-width screen, only outside an installed app, and only until it is
// dismissed once.
(function() {
	var KEY = "tripwire.install.dismissed";
	var deferred = null;

	if ("serviceWorker" in navigator) {
		navigator.serviceWorker.register("/sw.js").catch(function(err) {
			// Installability depends on this; a silent failure would look like
			// a phone that simply never offers to install.
			console.warn("Tripwire: service worker not registered -", err && err.message);
		});
	}

	function standalone() {
		return (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
	}
	function phone() { return window.matchMedia && matchMedia("(max-width: 767px)").matches; }
	function dismissed() { try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; } }
	function dismiss() { try { localStorage.setItem(KEY, "1"); } catch (e) {} $("#install-tip").remove(); }
	function ios() { return /iP(hone|ad|od)/.test(navigator.userAgent) && !window.MSStream; }

	function show(mode) {
		if ($("#install-tip").length || standalone() || dismissed() || !phone()) return;
		var text = mode === "prompt"
			? "Install Tripwire on this phone"
			: "Install: tap Share, then Add to Home Screen";
		var $tip = $('<div id="install-tip" role="status"><span class="tip-text"></span></div>');
		$tip.find(".tip-text").text(text);
		if (mode === "prompt") {
			$('<button type="button" class="tip-install">Install</button>').on("click", function() {
				if (!deferred) return;
				deferred.prompt();
				deferred.userChoice.then(function() { deferred = null; dismiss(); });
			}).appendTo($tip);
		}
		$('<button type="button" class="tip-close" aria-label="Not now">×</button>').on("click", dismiss).appendTo($tip);
		$("#topbar").after($tip);
	}

	window.addEventListener("beforeinstallprompt", function(e) {
		e.preventDefault();
		deferred = e;
		show("prompt");
	});
	window.addEventListener("appinstalled", dismiss);

	$(function() {
		if (ios() && !standalone()) show("ios");
	});

	// For checking the tip without a phone: tripwireInstallTip("prompt"|"ios").
	window.tripwireInstallTip = function(mode) { $("#install-tip").remove(); try { localStorage.removeItem(KEY); } catch (e) {} show(mode || "ios"); };
})();
