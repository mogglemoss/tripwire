// Resizable panels, with a rule for who decides.
//
// The layout holds still on its own: the fit ratchet (system-fit.js) sizes
// the compact row to what the System panel needs, and the columns keep their
// designed weights. Nothing moves unless a hand moves it -- and when a hand
// moves it, that wins until the hand resets it. Three layers:
//
//   fit         computes the default (system-fit.js, the CSS weights)
//   preference  a drag on a boundary; stored with the other panel settings,
//               columns as weights per panel identity so a moved panel keeps
//               its width, the row as a ratio of the grid so it survives a
//               different screen
//   reset       "Reset layout" in Settings and the palette; double-click a
//               divider to reset just that axis
//
// The boundaries are the gaps between panels: nothing is drawn until you
// hover, then a one-pixel line in the accent shows what you have hold of. A
// drag has to travel four pixels before it counts, so a clumsy click on a
// gap does nothing. Arrow keys on a focused divider move it in 16px steps.
// Below 960px the boundaries are inert and the stacked layout takes over.
//
// The fr-seeding trick is Squizz's (squizzlabs/tripwire panel-resize.js):
// before changing one pair of columns, every track is seeded from its
// rendered width, so the untouched third column keeps exactly its share.
tripwire.panelLayout = (function() {
	"use strict";

	var MIN_COLUMN = 180, MIN_ROW = 180, THRESHOLD = 4, STEP = 16, DESKTOP = 960;
	var DEFAULT_WEIGHT = { infoWidget: 1, signaturesWidget: 1.35, notesWidget: 0.85 };
	var pending = null, observer = null;

	// ---- pure ---------------------------------------------------------------

	// The grid-template-columns for these panels, from stored weights or the
	// designed defaults. Weights are relative, so pixels seeded from rendered
	// widths and the defaults' fr numbers are both fine.
	function columnTemplate(ids, weights, min) {
		return ids.map(function(id) {
			var w = weights && parseFloat(weights[id]);
			if (!(w > 0)) { w = DEFAULT_WEIGHT[id] || 1; }
			return "minmax(" + min + "px, " + w + "fr)";
		}).join(" ");
	}

	// Two neighbouring columns after the boundary between them moves by dx.
	function dragColumns(leftPx, rightPx, dx, min) {
		var total = leftPx + rightPx;
		var left = Math.max(min, Math.min(total - min, leftPx + dx));
		return { left: left, right: total - left };
	}

	// The sized row's height after its boundary moves by dy. When the chain
	// leads, the sized row is below the boundary, so it shrinks as dy grows.
	function dragRow(sizedPx, dy, gridPx, chainFirst, min) {
		var next = sizedPx + (chainFirst ? -dy : dy);
		return Math.max(min, Math.min(gridPx - min, next));
	}

	function passedThreshold(dx, dy, threshold) {
		return Math.abs(dx) >= threshold || Math.abs(dy) >= threshold;
	}

	// ---- state --------------------------------------------------------------

	function store() {
		if (!window.options) { return {}; }
		if (!options.panels) { options.panels = {}; }
		if (!options.panels.layout) { options.panels.layout = { columns: {}, rowRatio: null }; }
		if (!options.panels.layout.columns) { options.panels.layout.columns = {}; }
		return options.panels.layout;
	}
	function hasColumnPreference() { var s = store(); return !!(s.columns && Object.keys(s.columns).length); }
	function hasRowPreference() { return !!(store().rowRatio > 0); }
	function save() { if (window.options && options.saveDelay) { options.saveDelay(500); } }

	function grid() { return document.querySelector(".gridster > ul"); }
	function wrapper() { return document.querySelector(".gridster"); }
	function desktop() { return window.innerWidth >= DESKTOP; }
	function chainFirst() { var g = grid(); return !!(g && g.classList.contains("chain-first")); }

	// The compact panels, in layout order, visible only.
	function compactPanels() {
		var ids = tripwire.panels ? tripwire.panels.order() : ["infoWidget", "signaturesWidget", "notesWidget"];
		return ids.filter(function(id) { return id !== "chainWidget"; })
			.map(function(id) { return document.getElementById(id); })
			.filter(function(el) { return el && getComputedStyle(el).display !== "none"; });
	}

	// ---- apply --------------------------------------------------------------

	function apply() {
		var g = grid();
		if (!g) { return; }
		if (!desktop()) {
			g.style.gridTemplateColumns = "";
			if (hasRowPreference()) { g.style.removeProperty("--top-row"); }
			return;
		}
		var s = store();
		if (hasColumnPreference()) {
			g.style.gridTemplateColumns = columnTemplate(compactPanels().map(function(p) { return p.id; }), s.columns, MIN_COLUMN);
		} else {
			g.style.gridTemplateColumns = "";
		}
		if (hasRowPreference()) {
			var h = g.getBoundingClientRect().height;
			if (h) { g.style.setProperty("--top-row", Math.round(h * s.rowRatio) + "px"); }
		}
	}

	function reset(axis) {
		var s = store();
		if (!axis || axis === "column") { s.columns = {}; }
		if (!axis || axis === "row") { s.rowRatio = null; }
		var g = grid();
		if (g) {
			if (!axis || axis === "column") { g.style.gridTemplateColumns = ""; }
			if (!axis || axis === "row") { g.style.removeProperty("--top-row"); }
		}
		save();
		// The fit takes the row back.
		if ((!axis || axis === "row") && window.systemFit && systemFit.reset) { systemFit.reset(); }
		schedule();
	}

	// ---- handles ------------------------------------------------------------

	function makeHandle(axis) {
		var h = document.createElement("div");
		h.className = "panel-handle panel-handle-" + axis;
		h.setAttribute("role", "separator");
		h.setAttribute("aria-orientation", axis === "column" ? "vertical" : "horizontal");
		h.setAttribute("tabindex", "0");
		h.setAttribute("aria-label", axis === "column" ? "Resize columns" : "Resize rows");
		h.style.touchAction = "none";
		return h;
	}

	// The sized row's current height and the boundary it shares with the other row.
	function rowGeometry() {
		var g = grid(), gr = g.getBoundingClientRect();
		var rows = {};
		Array.prototype.forEach.call(document.querySelectorAll(".gridWidget"), function(p) {
			if (getComputedStyle(p).display === "none") { return; }
			var r = p.getBoundingClientRect(), key = Math.round(r.top);
			if (!rows[key]) { rows[key] = { top: r.top, bottom: r.bottom }; }
			rows[key].bottom = Math.max(rows[key].bottom, r.bottom);
		});
		var keys = Object.keys(rows).map(Number).sort(function(a, b) { return a - b; });
		if (keys.length < 2) { return null; }
		var first = rows[keys[0]], second = rows[keys[1]];
		var cf = chainFirst();
		var sized = cf ? (second.bottom - second.top) : (first.bottom - first.top);
		return { boundary: (first.bottom + second.top) / 2, sized: sized, gridTop: gr.top, gridHeight: gr.height, chainFirst: cf, firstBottom: first.bottom, secondTop: second.top };
	}

	function moveColumns(leftPanel, rightPanel, dx) {
		var s = store();
		var lr = leftPanel.getBoundingClientRect(), rr = rightPanel.getBoundingClientRect();
		var next = dragColumns(lr.width, rr.width, dx, MIN_COLUMN);
		s.columns[leftPanel.id] = next.left;
		s.columns[rightPanel.id] = next.right;
		apply();
	}

	function moveRow(dy) {
		var geo = rowGeometry(); if (!geo) { return; }
		var s = store(), g = grid();
		var sized = dragRow(geo.sized, dy, geo.gridHeight, geo.chainFirst, MIN_ROW);
		s.rowRatio = sized / geo.gridHeight;
		g.style.setProperty("--top-row", Math.round(sized) + "px");
	}

	function bindColumn(h, leftPanel, rightPanel) {
		h.addEventListener("pointerdown", function(e) {
			if (e.button !== 0) { return; }
			e.preventDefault();
			var startX = e.clientX, startY = e.clientY, dragging = false, lastX = startX;
			// Seed every track from its rendered width first, so the untouched
			// column keeps its share when this pair changes.
			var seeded = compactPanels().map(function(p) { return [p.id, p.getBoundingClientRect().width]; });
			h.setPointerCapture(e.pointerId);
			function onMove(ev) {
				if (!dragging) {
					if (!passedThreshold(ev.clientX - startX, ev.clientY - startY, THRESHOLD)) { return; }
					dragging = true;
					var s = store(); seeded.forEach(function(kv) { s.columns[kv[0]] = kv[1]; });
					document.body.classList.add("panel-resizing", "panel-resizing-column");
					h.classList.add("is-dragging");
				}
				moveColumns(leftPanel, rightPanel, ev.clientX - lastX);
				lastX = ev.clientX;
				placeHandles();
			}
			function onUp() {
				h.removeEventListener("pointermove", onMove);
				h.removeEventListener("pointerup", onUp);
				h.removeEventListener("pointercancel", onUp);
				if (dragging) {
					document.body.classList.remove("panel-resizing", "panel-resizing-column");
					h.classList.remove("is-dragging");
					save();
				}
				schedule();
			}
			h.addEventListener("pointermove", onMove);
			h.addEventListener("pointerup", onUp);
			h.addEventListener("pointercancel", onUp);
		});
		h.addEventListener("dblclick", function() { reset("column"); });
		h.addEventListener("keydown", function(e) {
			var dx = e.key === "ArrowLeft" ? -STEP : e.key === "ArrowRight" ? STEP : 0;
			if (!dx) { return; }
			e.preventDefault();
			if (!hasColumnPreference()) {
				var s = store(); compactPanels().forEach(function(p) { s.columns[p.id] = p.getBoundingClientRect().width; });
			}
			moveColumns(leftPanel, rightPanel, dx);
			save(); schedule();
		});
	}

	function bindRow(h) {
		h.addEventListener("pointerdown", function(e) {
			if (e.button !== 0) { return; }
			e.preventDefault();
			var startX = e.clientX, startY = e.clientY, dragging = false, lastY = startY;
			h.setPointerCapture(e.pointerId);
			function onMove(ev) {
				if (!dragging) {
					if (!passedThreshold(ev.clientX - startX, ev.clientY - startY, THRESHOLD)) { return; }
					dragging = true;
					document.body.classList.add("panel-resizing", "panel-resizing-row");
					h.classList.add("is-dragging");
				}
				moveRow(ev.clientY - lastY);
				lastY = ev.clientY;
				placeHandles();
			}
			function onUp() {
				h.removeEventListener("pointermove", onMove);
				h.removeEventListener("pointerup", onUp);
				h.removeEventListener("pointercancel", onUp);
				if (dragging) {
					document.body.classList.remove("panel-resizing", "panel-resizing-row");
					h.classList.remove("is-dragging");
					save();
				}
				schedule();
			}
			h.addEventListener("pointermove", onMove);
			h.addEventListener("pointerup", onUp);
			h.addEventListener("pointercancel", onUp);
		});
		h.addEventListener("dblclick", function() { reset("row"); });
		h.addEventListener("keydown", function(e) {
			var dy = e.key === "ArrowUp" ? -STEP : e.key === "ArrowDown" ? STEP : 0;
			if (!dy) { return; }
			e.preventDefault();
			moveRow(dy); save(); schedule();
		});
	}

	// Handles live in the wrapper (the grid itself is position: static) and
	// sit exactly over the gaps.
	function placeHandles() {
		var w = wrapper(), g = grid();
		if (!w || !g) { return; }
		var wr = w.getBoundingClientRect();
		var panels = compactPanels();
		var handles = w.querySelectorAll(".panel-handle-column");
		for (var i = 0; i < panels.length - 1 && i < handles.length; i++) {
			var a = panels[i].getBoundingClientRect(), b = panels[i + 1].getBoundingClientRect();
			var h = handles[i];
			h.style.left = Math.round(a.right - wr.left) + "px";
			h.style.width = Math.max(2, Math.round(b.left - a.right)) + "px";
			h.style.top = Math.round(Math.min(a.top, b.top) - wr.top) + "px";
			h.style.height = Math.round(Math.max(a.bottom, b.bottom) - Math.min(a.top, b.top)) + "px";
		}
		var rh = w.querySelector(".panel-handle-row"), geo = rowGeometry();
		if (rh && geo) {
			var gr = g.getBoundingClientRect();
			rh.style.left = Math.round(gr.left - wr.left) + "px";
			rh.style.width = Math.round(gr.width) + "px";
			rh.style.top = Math.round(geo.firstBottom - wr.top) + "px";
			rh.style.height = Math.max(2, Math.round(geo.secondTop - geo.firstBottom)) + "px";
		}
	}

	function render() {
		pending = null;
		var w = wrapper(), g = grid();
		if (!w || !g) { return; }
		Array.prototype.forEach.call(w.querySelectorAll(".panel-handle"), function(h) { h.remove(); });
		apply();
		if (!desktop()) { return; }
		var panels = compactPanels();
		for (var i = 0; i < panels.length - 1; i++) {
			var h = makeHandle("column");
			bindColumn(h, panels[i], panels[i + 1]);
			w.appendChild(h);
		}
		if (rowGeometry()) {
			var rh = makeHandle("row");
			bindRow(rh);
			w.appendChild(rh);
		}
		placeHandles();
	}

	function schedule() {
		if (pending) { return; }
		pending = requestAnimationFrame(render);
	}

	$(function() {
		if (!grid()) { return; }
		apply();
		schedule();
		$(document).on("panels:layout", schedule);
		$(window).on("resize", schedule);
		if (window.ResizeObserver) {
			observer = new ResizeObserver(function() { placeHandles(); });
			observer.observe(grid());
			Array.prototype.forEach.call(document.querySelectorAll(".gridWidget"), function(p) { observer.observe(p); });
		}
	});

	return {
		apply: apply, reset: reset, refresh: schedule,
		hasRowPreference: hasRowPreference, hasColumnPreference: hasColumnPreference,
		columnTemplate: columnTemplate, dragColumns: dragColumns, dragRow: dragRow, passedThreshold: passedThreshold
	};
})();
