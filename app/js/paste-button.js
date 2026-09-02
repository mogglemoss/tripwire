// A visible way in for the tool's main loop.
//
// Pasting probe-scanner results has always been the primary way signatures
// get into Tripwire, and it has never had a control on screen -- Ctrl-V with
// nothing focused. New corp members find it in the tutorial or not at all,
// and on a tablet there is no Ctrl-V to find.
//
// The button reads the clipboard directly where the browser allows it (a
// user gesture is enough in Chromium; Firefox and Safari prompt or refuse),
// and otherwise falls back to the existing hidden textarea and asks for the
// keystroke. Either way the text ends up in the same parsePaste path the
// keystroke uses, so the two routes cannot drift.

(function() {
	function ingest(text) {
		if (!text || !text.trim()) {
			Notify.trigger("Nothing on the clipboard looked like scanner results.");
			return;
		}
		Notify.trigger("Paste detected<br/>(<a id='fullPaste' href=''>Click to delete missing sigs</a>)");
		$("#fullPaste").data("paste", text);
		tripwire.pasteSignatures.parsePaste(text);
	}

	function fallback() {
		$("#clipboard").focus();
		Notify.trigger("Press Ctrl-V (or &#8984;V) now to paste your scan results.");
	}

	$(function() {
		$(document).on("click", "#paste-signatures", function(e) {
			e.preventDefault();
			if (navigator.clipboard && navigator.clipboard.readText) {
				navigator.clipboard.readText().then(ingest, fallback);
			} else {
				fallback();
			}
		});
	});
})();
