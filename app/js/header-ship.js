// The ship under the pilot's name. ESI already polls the tracked character's
// ship every five seconds and writes it into the tracking dropdown; this
// mirrors the active character's hull into the letterhead, and clears it when nothing is tracked.
(function() {
	function sync() {
		var $el = $("#hdr-ship");
		if (!$el.length) return;
		var chars = window.tripwire && tripwire.esi && tripwire.esi.characters;
		var c = chars && window.options && options.tracking ? chars[options.tracking.active] : null;
		var type = c && c.shipTypeName;
		if (!type) { $el.addClass("hidden").empty(); return; }
		// The hull only. What the pilot named the ship is theirs, not a fact
		// the desk needs.
		$el.text(type).removeClass("hidden");
	}
	$(function() {
		sync();
		if (!window.MutationObserver) return;
		// esi.js writes hull and name into the dropdown rows; set_tracking_text
		// flips the tracked-name span when the active character changes.
		var opts = {childList: true, characterData: true, subtree: true, attributes: true};
		["tracking", "user-track"].forEach(function(id) {
			var t = document.getElementById(id);
			if (t) new MutationObserver(sync).observe(t, opts);
		});
	});
})();
