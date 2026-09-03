// The header names the system you are viewing. The panels already do, but the
// header is where the eye goes for "where am I", and until now it answered
// with the character's location -- a different fact. #infoSystem is the
// source of truth the system panel keeps current; this mirrors it.
(function() {
	function sync() {
		var name = $("#infoSystem").text().trim();
		if (name) { $("#hdr-system").text(name); }
	}
	$(function() {
		sync();
		var target = document.getElementById("infoSystem");
		if (target && window.MutationObserver) {
			new MutationObserver(sync).observe(target, {childList: true, characterData: true, subtree: true});
		}
		$("#hdr-system").on("click", function(e) { e.preventDefault(); $("#search").trigger("click"); });
	});
})();
