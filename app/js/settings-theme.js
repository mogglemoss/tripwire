// Settings > Display > Theme: follow the device, or always light or dark.
// The same choice as the button beside EVE time, which phones scroll past;
// it applies at once and is kept in this browser, as that button's is.
tripwire.settingsTheme = (function() {
	"use strict";
	var KEY = "tripwire.theme";

	function current() {
		var t = document.documentElement.getAttribute("data-theme");
		return t === "light" || t === "dark" ? t : "auto";
	}

	function render() {
		$("#dialog-options input[name=room][value=" + current() + "]").prop("checked", true);
	}

	function choose(value) {
		if (value === "light" || value === "dark") { themeToggle.apply(value); return; }
		try { localStorage.removeItem(KEY); } catch (e) { /* the choice simply will not persist */ }
		document.documentElement.removeAttribute("data-theme");
		themeToggle.paint();
		$(document).trigger("tripwire:theme", themeToggle.effective());
		if (window.activity && activity.retheme) { activity.retheme(); }
	}

	$(function() {
		$("#dialog-options").on("change", "input[name=room]", function() { choose(this.value); });
		$(document).on("tripwire:theme", function() { if ($("#dialog-options").is(":visible")) { render(); } });
	});

	return {render: render, choose: choose};
})();
