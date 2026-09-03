// The System panel fits, by default.
//
// The top row was a fixed 46vh and the graph a fixed 170px, so on anything
// under 1080px tall the panel scrolled: at 1440x900 it had 370px and needed
// 479; at 1280x800, 324 against 504. The reference (Tripwire as shipped)
// shows name, graph, ranges, links and gates with no scrollbar, and Scott
// asked for the same.
//
// Two dials, in this order. The graph gives up height first, down to a
// floor where it still reads. If the rest of the panel plus that floor is
// still taller than the row, the row grows to take it (capped, so the chain
// keeps a real share), and the chain takes what is left -- the trade the
// layout notes already chose: a map that pans beats a panel you scroll.
var systemFit = new function() {
	var MIN = 110, MAX = 170, ROW = 0.46, ROW_CAP = 0.64;
	var appliedRow = null, self = this;

	function panel() { return document.querySelector("#infoWidget > .content.sys-panel"); }
	function px(v) { return parseFloat(v) || 0; }

	// Everything in the panel except the chart itself: siblings, margins,
	// flex gap, padding, and the graph's own margins.
	function others(p) {
		var cs = getComputedStyle(p);
		var total = px(cs.paddingTop) + px(cs.paddingBottom);
		var gap = px(cs.rowGap), visible = 0;
		Array.prototype.forEach.call(p.children, function(k) {
			var ks = getComputedStyle(k);
			if (ks.display === "none") return;
			visible++;
			total += px(ks.marginTop) + px(ks.marginBottom);
			if (k.id !== "activityGraph") total += k.getBoundingClientRect().height;
		});
		return total + gap * Math.max(0, visible - 1);
	}
	// The chart's container is a few px taller than the chart it holds.
	function overhead() {
		var g = document.getElementById("activityGraph");
		var box = g ? g.getBoundingClientRect().height : 0;
		var drawn = activity && activity.options && activity.options.height;
		return (box > 0 && drawn && box >= drawn) ? box - drawn : 8;
	}

	// Grow the top row if the panel cannot hold the graph at its floor.
	function fitRow(p, need) {
		var grid = document.querySelector(".gridster > ul");
		if (!grid || window.innerWidth < 1280) return;
		var widget = document.getElementById("infoWidget");
		var chrome = widget.getBoundingClientRect().height - p.clientHeight;
		var wanted = need + chrome;
		var row = Math.max(ROW * window.innerHeight, Math.min(wanted, ROW_CAP * window.innerHeight));
		if (appliedRow !== null && Math.abs(row - appliedRow) < 1) return;
		appliedRow = row;
		grid.style.setProperty("--top-row", Math.round(row) + "px");
	}

	// The chart height that fits the panel now. Sets the row as a side effect.
	this.graphHeight = function() {
		var p = panel();
		if (!p) return MAX;
		var rest = others(p), over = overhead();
		fitRow(p, rest + MIN + over);
		var avail = p.clientHeight - rest - over;
		return Math.round(Math.max(MIN, Math.min(MAX, avail)));
	};

	this.run = function() {
		var p = panel(), g = document.getElementById("activityGraph");
		if (!p || !g || !activity || !activity.view || !activity.graph) return;
		if (g.classList.contains("is-empty") || g.classList.contains("is-sparse")) {
			fitRow(p, others(p) + g.getBoundingClientRect().height);
			return;
		}
		var h = self.graphHeight();
		if (h !== activity.options.height) {
			activity.options.height = h;
			activity.redraw();
		}
	};

	var pending = null;
	function schedule() {
		if (pending) return;
		pending = requestAnimationFrame(function() { pending = null; self.run(); });
	}

	$(function() {
		var p = panel();
		if (!p || !window.ResizeObserver) return;
		var ro = new ResizeObserver(schedule);
		ro.observe(p);
		Array.prototype.forEach.call(p.children, function(k) { ro.observe(k); });
		$(window).on("resize", schedule);
	});
};
