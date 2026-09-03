// The room lights. Sun and moon on the letterhead: the
// button shows the light you would switch to. A stored choice wins over the
// OS; with no choice the page follows the OS and the button still works.
var themeToggle = new function() {
	var KEY = "tripwire.theme", self = this;
	var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

	this.effective = function() {
		var set = document.documentElement.getAttribute("data-theme");
		if (set === "dark" || set === "light") return set;
		return (media && media.matches) ? "dark" : "light";
	};

	this.apply = function(theme) {
		document.documentElement.setAttribute("data-theme", theme);
		try { localStorage.setItem(KEY, theme); } catch (e) {}
		self.paint();
		$(document).trigger("tripwire:theme", theme);
		if (window.activity && activity.retheme) activity.retheme();
	};

	this.paint = function() {
		var dark = self.effective() === "dark";
		var label = dark ? "Switch to light" : "Switch to dark";
		$("#theme-toggle").text(dark ? "☀" : "☾").attr({title: label, "aria-label": label});
	};

	$(function() {
		self.paint();
		$("#theme-toggle").on("click", function() { self.apply(self.effective() === "dark" ? "light" : "dark"); });
		if (media && media.addEventListener) media.addEventListener("change", self.paint);
	});
};
