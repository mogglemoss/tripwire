// The signature table's header wears the same per-column alignment classes
// as its cells (Settings > Signatures), so the two line up whatever is set.
(function() {
	var COLS = ["sigID", "sigType", "sigAge", "leadsTo", "sigLife", "sigMass"];
	function apply() {
		var a = window.options && options.signatures && options.signatures.alignment;
		if (!a) { return; }
		$("#sigTable thead th").each(function(i) {
			$(this).removeClass("leftAlign centerAlign rightAlign").addClass(a[COLS[i]] || "leftAlign");
		});
	}
	$(function() {
		apply();
		$(document).on("dialogclose", ".ui-dialog", apply);
		$(document).on("tripwire:options", apply);
	});
	window.sigAlign = { apply: apply };
})();
