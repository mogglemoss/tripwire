// The System panel fits, by default.
//
// The top row was a fixed 46vh and the graph a fixed 170px, so on anything
// under 1080px tall the panel scrolled: at 1440x900 it had 370px and needed
// 479; at 1280x800, 324 against 504. The reference (Tripwire as shipped)
// shows name, graph, ranges, links and gates with no scrollbar, and this
// fork keeps that.
//
// Two dials, in this order. The graph gives up height first, down to a
// floor where it still reads. If the rest of the panel plus that floor is
// still taller than the row, the row grows to take it (capped, so the chain
// keeps a real share), and the chain takes what is left -- the trade the
// layout notes already chose: a map that pans beats a panel you scroll.
var systemFit = new function() {
	var MIN = 96, MAX = 170, ROW = 0.40, ROW_CAP = 0.64;
	var appliedRow = null, self = this;

	// The row only ever grows, and remembers. Switching between a k-space
	// system (gates, blue loot, legend) and a J-space one (statics, often no
	// activity) changed what the panel needed by ~50px, and a row that
	// followed it made all four panels jump on every system change. Now the
	// row is the largest any visited system has needed at this window height,
	// kept in localStorage, so after the first visit it does not move.
	function rowKey() { return "tripwire.toprow." + window.innerHeight; }
	function storedRow() { try { return parseFloat(localStorage.getItem(rowKey())) || null; } catch (e) { return null; } }
	function storeRow(px) { try { localStorage.setItem(rowKey(), String(Math.round(px))); } catch (e) {} }

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
		row = Math.max(row, appliedRow || 0, storedRow() || 0);
		if (appliedRow !== null && Math.abs(row - appliedRow) < 1) return;
		appliedRow = row;
		storeRow(row);
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
		// Apply the remembered row before anything is measured.
		var grid = document.querySelector(".gridster > ul"), remembered = storedRow();
		if (grid && remembered && window.innerWidth >= 1280) {
			appliedRow = remembered;
			grid.style.setProperty("--top-row", Math.round(remembered) + "px");
		}
		var p = panel();
		if (!p || !window.ResizeObserver) return;
		var ro = new ResizeObserver(schedule);
		ro.observe(p);
		Array.prototype.forEach.call(p.children, function(k) { ro.observe(k); });
		$(window).on("resize", schedule);
	});
};
