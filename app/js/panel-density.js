// Panels compact by their own width, not the window's.
//
// The bar labels, the graph's range links and the signature table's tight
// columns used to switch on viewport media queries. A panel can be narrow
// inside a wide window (three columns, a moved panel, a dragged divider),
// so each panel is measured and given density classes from its own width:
//
//   panel-compact  labels give way to icons
//   panel-narrow   secondary controls go, table columns tighten
//   panel-wrap     the bar wraps to a second line rather than clip
//
// Thresholds reproduce where the old viewport rules switched, measured at
// 1440 / 1100 / 960 wide. Until the first measurement lands, the old
// viewport rules still apply (html:not(.panels-measured)), so nothing
// flashes on load and a page without JavaScript keeps today's behaviour.
// Idea from Squizz (squizzlabs/tripwire 312d927), generalised to every panel.
(function() {
	"use strict";

	var THRESHOLDS = {
		signaturesWidget: { compact: 648, narrow: 500, wrap: 460 },
		infoWidget:       { compact: 432, narrow: 330, wrap: 0 },
		notesWidget:      { compact: 0,   narrow: 0,   wrap: 0 },
		chainWidget:      { compact: 0,   narrow: 0,   wrap: 0 }
	};

	// Pure: which density classes a panel of this width carries.
	function classify(width, thresholds) {
		var t = thresholds || {};
		var classes = [];
		if (width < (t.compact || 0)) { classes.push("panel-compact"); }
		if (width < (t.narrow || 0))  { classes.push("panel-narrow"); }
		if (width < (t.wrap || 0))    { classes.push("panel-wrap"); }
		return classes;
	}

	function apply(panel) {
		var width = panel.getBoundingClientRect().width;
		if (!width) { return; }   // hidden panels keep whatever they had
		var want = classify(width, THRESHOLDS[panel.id]);
		["panel-compact", "panel-narrow", "panel-wrap"].forEach(function(c) {
			panel.classList.toggle(c, want.indexOf(c) !== -1);
		});
	}

	function measureAll() {
		var panels = document.querySelectorAll(".gridWidget");
		Array.prototype.forEach.call(panels, apply);
		document.documentElement.classList.add("panels-measured");
	}

	$(function() {
		var panels = document.querySelectorAll(".gridWidget");
		if (!panels.length) { return; }
		measureAll();
		if (window.ResizeObserver) {
			var observer = new ResizeObserver(function(entries) {
				entries.forEach(function(entry) { apply(entry.target); });
			});
			Array.prototype.forEach.call(panels, function(p) { observer.observe(p); });
		} else {
			$(window).on("resize.panelDensity", measureAll);
		}
	});

	if (typeof tripwire !== "undefined") {
		tripwire.panelDensity = { classify: classify, thresholds: THRESHOLDS, measure: measureAll };
	}
})();
