// Panel visibility menu, on the topbar's layout control.
//
// That control used to arm gridster's drag-and-resize. The desktop layout is a
// CSS grid now, so there is nothing to drag -- but "which panels do I want" is
// still a real question, and the panel registry already answers it. The
// control opens that instead of doing nothing.

(function() {
	function close() { $("#panel-menu").remove(); $(document).off("mousedown.panelMenu"); }

	function open($btn) {
		close();
		if (!tripwire.panels) { return; }

		var $menu = $('<div id="panel-menu" role="menu"></div>');

		tripwire.panels.all().forEach(function(p) {
			var on = tripwire.panels.isVisible(p.id);
			$('<button type="button" role="menuitemcheckbox"></button>')
				.attr("aria-checked", on ? "true" : "false")
				.append($('<span class="tick"></span>').text(on ? "✓" : ""))
				.append($("<span></span>").text(p.title))
				.on("click", function(e) {
					e.stopPropagation();
					tripwire.panels.toggle(p.id);
					open($btn);          // re-render so the ticks follow
				})
				.appendTo($menu);
		});

		$("body").append($menu);

		var r = $btn[0].getBoundingClientRect();
		$menu.css({
			top: Math.round(r.bottom + 4) + "px",
			// keep it on screen when the control sits near the right edge
			left: Math.round(Math.min(r.left, window.innerWidth - $menu.outerWidth() - 8)) + "px"
		});

		setTimeout(function() {
			$(document).on("mousedown.panelMenu", function(e) {
				if (!$(e.target).closest("#panel-menu, #layout").length) { close(); }
			});
		}, 0);
	}

	$(function() {
		$("#layout").attr("data-tooltip", "Show or hide panels").on("click", function(e) {
			e.preventDefault();
			e.stopPropagation();
			if ($("#panel-menu").length) { close(); } else { open($(this)); }
		});
	});
})();
