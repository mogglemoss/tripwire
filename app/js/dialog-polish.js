// Tags dialog buttons by role so CSS can style them as roles rather than by
// position. The previous rule used :last-child, which made "Close" the primary
// action in Settings -- Save sits first there and Close last.
//
// Hooks dialogopen from outside, so no dialog source is touched.

(function() {
	var PRIMARY = ["save", "add", "ok", "apply", "create", "confirm", "send", "search", "login"];
	var DESTRUCTIVE = ["delete", "remove", "reset"];
	var QUIET = ["cancel", "close"];

	// Three roles. Everything else is an ordinary secondary action and sits
	// between the quiet action and the primary. The CSS orders by role, so a
	// dialog whose config lists Cancel first still renders it beside Save.
	function tag() {
		$(".ui-dialog-buttonpane button").each(function() {
			var label = $.trim($(this).text()).toLowerCase();
			$(this).toggleClass("is-primary", PRIMARY.indexOf(label) > -1)
			       .toggleClass("is-destructive", DESTRUCTIVE.indexOf(label) > -1)
			       .toggleClass("is-quiet", QUIET.indexOf(label) > -1);
		});
	}

	// Every dialog gets the same skin class, whatever its own config asked
	// for. Done at the prototype so no dialog source is touched.
	if ($.ui && $.ui.dialog) {
		var base = $.ui.dialog.prototype.options.dialogClass || "";
		$.ui.dialog.prototype.options.dialogClass = $.trim(base + " tw-dialog");
	}

	$(function() {
		$(document).on("dialogopen", ".ui-dialog", function() { setTimeout(tag, 0); });
		// Buttons are shown/hidden per mode (Add vs Save), so retag on change too.
		$(document).on("click", ".ui-dialog-buttonpane button", function() { setTimeout(tag, 0); });
	});
})();
