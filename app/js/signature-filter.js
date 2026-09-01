// Signature filter bar, after Aperture's SignatureModule.
//
// Group chips, a scan-state cycle, and live counts above the signature table.
// Everything is derived from data Tripwire already holds -- signature type,
// name, and the linked wormhole -- so this adds no schema and no requests.
//
// Additive: the table markup in addSignature.js is untouched. Rows are tagged
// after render and filtered by visibility, which survives the five-second
// refresh re-rendering them.

tripwire.sigFilter = (function() {
	var STORE = "tripwire:signatures:filter";

	// Order matches the probe scanner's own grouping.
	var GROUPS = [
		{key: "wormhole", label: "Wormhole"},
		{key: "combat",   label: "Combat"},
		{key: "relic",    label: "Relic"},
		{key: "data",     label: "Data"},
		{key: "gas",      label: "Gas"},
		{key: "ore",      label: "Ore"},
		{key: "unknown",  label: "Unknown"}
	];

	// Aperture's site-safety split: a combat site is somewhere you can be
	// shot by rats, an exploration site is not. A wormhole is neither.
	var ACTIVITY = {combat: "combat", relic: "explore", data: "explore", gas: "explore", ore: "explore"};

	var state = load();
	var $bar, $stats;

	function load() {
		try {
			var raw = JSON.parse(localStorage.getItem(STORE));
			if (raw && Array.isArray(raw.groups)) {
				return {groups: raw.groups.slice(), scan: raw.scan || "all"};
			}
		} catch (e) { /* absent or corrupt -- fall through to defaults */ }
		return {groups: [], scan: "all"};
	}

	function save() {
		try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {}
	}

	function signatures() {
		return (tripwire.client && tripwire.client.signatures) || {};
	}

	function wormholeFor(sigId) {
		var holes = (tripwire.client && tripwire.client.wormholes) || {};
		for (var w in holes) {
			if (holes[w].initialID == sigId || holes[w].secondaryID == sigId) { return holes[w]; }
		}
		return null;
	}

	// "Scanned" means the row is actually useful: it has a group, and the thing
	// that identifies it. For a wormhole that is its type; for a cosmic site,
	// its name. Mirrors Aperture's definition.
	function isScanned(sig) {
		if (!sig || !sig.type || sig.type === "unknown") { return false; }
		if (sig.type === "wormhole") {
			var w = wormholeFor(sig.id);
			return !!(w && w.type && w.type !== "????");
		}
		return !!sig.name;
	}

	function visibleRows() {
		return $("#sigTable tbody tr[data-id]");
	}

	function apply() {
		var sigs = signatures();
		var total = 0, unscanned = 0, wormholes = 0;

		visibleRows().each(function() {
			var sig = sigs[$(this).data("id")];
			if (!sig) { return; }

			var group = sig.type || "unknown";
			var scanned = isScanned(sig);

			total++;
			if (!scanned) { unscanned++; }
			if (group === "wormhole") { wormholes++; }

			// Tag for styling (activity glyph, unscanned emphasis) regardless
			// of whether the row is filtered out.
			$(this).attr("data-group", group)
			       .attr("data-activity", ACTIVITY[group] || "")
			       .toggleClass("sig-unscanned", !scanned);

			var groupOk = !state.groups.length || state.groups.indexOf(group) > -1;
			var scanOk = state.scan === "all" ||
			             (state.scan === "scanned" && scanned) ||
			             (state.scan === "unscanned" && !scanned);

			$(this).toggleClass("sig-filtered", !(groupOk && scanOk));
		});

		if ($stats) {
			var parts = [total + (total === 1 ? " signature" : " signatures")];
			if (unscanned) { parts.push(unscanned + " unscanned"); }
			if (wormholes) { parts.push(wormholes + (wormholes === 1 ? " wormhole" : " wormholes")); }
			$stats.text(parts.join(" · "));
		}

		if ($bar) {
			$bar.find("[data-group-chip]").each(function() {
				$(this).toggleClass("on", state.groups.indexOf($(this).attr("data-group-chip")) > -1);
			});
			$bar.find("[data-scan-chip]")
				.attr("data-state", state.scan)
				.text(state.scan === "all" ? "All" : state.scan === "scanned" ? "Scanned" : "Unscanned")
				.toggleClass("on", state.scan !== "all");
		}
	}

	function toggleGroup(key) {
		var i = state.groups.indexOf(key);
		if (i > -1) { state.groups.splice(i, 1); } else { state.groups.push(key); }
		save(); apply();
	}

	function cycleScan() {
		state.scan = state.scan === "all" ? "scanned" : state.scan === "scanned" ? "unscanned" : "all";
		save(); apply();
	}

	function build() {
		var $wrapper = $("#sigTableWrapper");
		if (!$wrapper.length || $("#sigFilterBar").length) { return; }

		$bar = $('<div id="sigFilterBar" class="sig-filter"></div>');

		var $chips = $('<div class="sig-filter-groups"></div>').appendTo($bar);
		GROUPS.forEach(function(g) {
			$('<button type="button" class="sig-chip"></button>')
				.attr("data-group-chip", g.key)
				.text(g.label)
				.on("click", function() { toggleGroup(g.key); })
				.appendTo($chips);
		});

		$('<button type="button" class="sig-chip sig-scan"></button>')
			.attr("data-scan-chip", "1")
			.attr("title", "Cycle: all / scanned only / unscanned only")
			.on("click", cycleScan)
			.appendTo($bar);

		$stats = $('<span class="sig-stats"></span>').appendTo($bar);

		$wrapper.before($bar);
	}

	$(function() {
		build();
		apply();

		// The table is re-rendered by the refresh cycle; re-tag when it changes.
		var target = document.getElementById("sigTable");
		if (target && window.MutationObserver) {
			var pending = null;
			new MutationObserver(function() {
				clearTimeout(pending);
				pending = setTimeout(apply, 60);
			}).observe(target, {childList: true, subtree: true});
		}
	});

	return {apply: apply, state: function() { return state; }};
})();
