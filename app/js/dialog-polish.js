// Tags dialog buttons by role so CSS can style them as roles rather than by
// position. The previous rule used :last-child, which made "Close" the primary
// action in Settings -- Save sits first there and Close last.
//
// Hooks dialogopen from outside, so no dialog source is touched.

(function() {
	var PRIMARY = ["save", "add", "ok", "apply", "create", "confirm"];
	var DESTRUCTIVE = ["delete", "remove", "reset"];

	function tag() {
		$(".ui-dialog-buttonpane button").each(function() {
			var label = $.trim($(this).text()).toLowerCase();
			$(this).toggleClass("is-primary", PRIMARY.indexOf(label) > -1)
			       .toggleClass("is-destructive", DESTRUCTIVE.indexOf(label) > -1);
		});
	}

	$(function() {
		$(document).on("dialogopen", ".ui-dialog", function() { setTimeout(tag, 0); });
		// Buttons are shown/hidden per mode (Add vs Save), so retag on change too.
		$(document).on("click", ".ui-dialog-buttonpane button", function() { setTimeout(tag, 0); });
	});
})();
