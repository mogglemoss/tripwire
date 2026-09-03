// The mask menu closes when you click anywhere else, or press Escape.
$(document).on("click", function(e) {
	var menu = document.getElementById("mask-menu");
	if (!menu || menu.style.display === "none") return;
	if ($(e.target).closest("#mask-menu, #mask-menu-link").length) return;
	menu.style.display = "none";
});
$(document).on("keydown", function(e) {
	if (e.key === "Escape") {
		var menu = document.getElementById("mask-menu");
		if (menu && menu.style.display !== "none") menu.style.display = "none";
	}
});
