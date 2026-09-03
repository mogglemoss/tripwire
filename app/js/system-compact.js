// The System panel, two rows shorter.
//
// The graph's range links (Week / 48h / 24h) were a row of their own under
// the legend, and the external links another row under that. The ranges are
// a control, so they move into the panel's header bar; the external links
// share the legend's row, right-aligned. The nodes are moved, not rebuilt,
// so their inline handlers and systemChange's href filling keep working.
(function() {
	$(function() {
		var $ranges = $("#activityGraphControls > a");
		if ($ranges.length) {
			var $wrap = $('<span id="sys-range" class="sys-range-hdr" role="group" aria-label="Activity range"></span>');
			$ranges.appendTo($wrap);
			$("#infoWidget > .controls .bar-right").prepend($wrap);
			// Nothing marked the current range before; the graph starts at 24h.
			var current = (window.activity && activity.span) || 24;
			$wrap.find("a").each(function() {
				var m = /activity\.time\((\d+)\)/.exec($(this).attr("href") || "");
				$(this).attr("data-span", m ? m[1] : "").toggleClass("active", !!m && +m[1] === current);
			}).on("click", function() {
				$wrap.find("a").removeClass("active");
				$(this).addClass("active");
			});
		}
		var $links = $("#infoLinks");
		if ($links.length && $("#activityGraphControls").length) {
			$links.appendTo("#activityGraphControls").addClass("in-legend-row");
		}
	});
})();
