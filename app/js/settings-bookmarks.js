// Settings > Bookmarks: the words this server reads in bookmark titles, as
// chips, and a pilot's own as word -> meaning rows if they keep different
// ones. "Try a title" reads a title live with whichever is in force.
tripwire.settingsBookmarks = (function() {
	"use strict";
	var B = tripwire.bookmarks;
	var $pane = function() { return $("#dialog-options [data-pane=bookmarks]"); };

	function server() { return B.convention(window.TW_BOOKMARK_CONVENTION || {}, null); }
	function own() { return $("#bm-own").prop("checked"); }
	function mine() { return options.bookmarks || {}; }

	var MEANING_OPTIONS = null;
	function meaningSelect(value) {
		if (!MEANING_OPTIONS) {
			MEANING_OPTIONS = B.MEANINGS.map(function(g) {
				return "<optgroup label='" + g[0] + "'>" + g[1].map(function(m) { return "<option value='" + m[0] + "'>" + m[1] + "</option>"; }).join("") + "</optgroup>";
			}).join("");
		}
		return $("<select class='bm-meaning' aria-label='Meaning'>").html(MEANING_OPTIONS).val(value);
	}

	function row(r) {
		var $word = $("<input type='text' class='bm-word' spellcheck='false' autocomplete='off' aria-label='Word'>").val(r.word || "");
		var $remove = $("<button type='button' class='bm-remove'>&times;</button>").attr("aria-label", "Remove " + (r.word || "word"));
		return $("<div class='bm-row'>").append($word, meaningSelect(r.meaning || "destinations.High-Sec"), $remove);
	}

	// Following the server: one chip per meaning, its words together.
	function showChips(conv) {
		var $w = $("#bm-words").removeClass("is-own").empty(), by = {}, order = [];
		B.toRows(conv).forEach(function(r) { if (!by[r.meaning]) { by[r.meaning] = []; order.push(r.meaning); } by[r.meaning].push(r.word); });
		if (!order.length) { $w.append($("<p class='bm-empty'>").text("No words: only what EVE names is read.")); }
		order.forEach(function(m) {
			$w.append($("<span class='bm-chip'>").append($("<b>").text(by[m].join(" · ")), document.createTextNode(B.meaningLabel(m))));
		});
		$("#bm-add").prop("hidden", true);
	}

	function showRows(conv) {
		var $w = $("#bm-words").addClass("is-own").empty();
		B.toRows(conv).forEach(function(r) { $w.append(row(r)); });
		$("#bm-add").prop("hidden", false);
	}

	// The rows as a convention, meaning -> words.
	function read() {
		return B.fromRows($("#bm-words .bm-row").map(function() {
			return {word: $(this).find(".bm-word").val(), meaning: $(this).find(".bm-meaning").val()};
		}).get());
	}

	// A word can mean one thing. Two rows giving it two meanings are both
	// marked, with a line saying which. "???" may be both an unscanned
	// signature and an unknown system: where it sits tells them apart.
	var EITHER = ["unknownSignature", "unknownSystem"];
	function checkDups() {
		var seen = {}, lines = [];
		var $rows = $("#bm-words .bm-row").removeClass("is-dup");
		$rows.each(function() {
			var w = B.list($(this).find(".bm-word").val())[0];
			if (!w) { return; }
			(seen[w] = seen[w] || []).push({row: this, meaning: $(this).find(".bm-meaning").val()});
		});
		Object.keys(seen).forEach(function(w) {
			var meanings = seen[w].map(function(r) { return r.meaning; }).filter(function(m, i, all) { return all.indexOf(m) === i; });
			if (meanings.length < 2) { return; }
			if (meanings.every(function(m) { return EITHER.indexOf(m) >= 0; })) { return; }
			seen[w].forEach(function(r) { $(r.row).addClass("is-dup"); });
			lines.push(w + " is listed as " + meanings.map(B.meaningLabel).join(" and ") + ". A word can mean only one thing.");
		});
		$("#bm-dups").prop("hidden", !lines.length).empty().append(lines.map(function(l) { return $("<p>").text(l); }));

		// Aliases: several words for one meaning, which is fine. Marked, and
		// listed together so it is plain they read the same.
		var byMeaning = {}, order = [];
		$rows.removeClass("is-alias").each(function() {
			var w = B.list($(this).find(".bm-word").val())[0], m = $(this).find(".bm-meaning").val();
			if (!w || $(this).hasClass("is-dup")) { return; }
			if (!byMeaning[m]) { byMeaning[m] = {words: [], rows: []}; order.push(m); }
			if (byMeaning[m].words.indexOf(w) < 0) { byMeaning[m].words.push(w); }
			byMeaning[m].rows.push(this);
		});
		var aliases = order.filter(function(m) { return byMeaning[m].words.length > 1; });
		aliases.forEach(function(m) { $(byMeaning[m].rows).addClass("is-alias"); });
		$("#bm-aliases").prop("hidden", !aliases.length).empty().append(aliases.length ? [$("<span class='bm-aliases-label'>").text("Aliases")].concat(aliases.map(function(m) {
			return $("<span class='bm-alias'>").append($("<b>").text(byMeaning[m].words.join(" = ")), document.createTextNode(B.meaningLabel(m)));
		})) : []);
	}

	// The convention the pane stands for right now.
	function current() { return own() ? B.merge(B.DEFAULT, read()) : server(); }

	function tryIt() {
		var text = $.trim($("#bm-try").val());
		if (!text) { return $("#bm-result").text("").removeClass("is-miss"); }
		var c = B.compile(current()), b = B.parse(text, c);
		$("#bm-result").text(B.describe(b, c, appData.systems, appData.regions, appData.genericSystemTypes)).toggleClass("is-miss", !b);
	}

	function show() {
		var srv = server();
		$("#bm-source").text(window.TW_BOOKMARK_CONVENTION ? "this server uses " + (srv.name || "its own") : "this server uses Tripwire's own");
		if (own()) { showRows(mine().convention ? B.merge(B.DEFAULT, mine().convention) : srv); } else { showChips(srv); }
		checkDups();
		tryIt();
	}

	function render() {
		$("#bm-own").prop("checked", !!(mine().own && mine().convention));
		show();
	}

	function save() {
		// Your words are kept while you follow the server, so switching back restores them.
		options.bookmarks = {own: own(), convention: own() ? read() : (mine().convention || null)};
	}

	$(function() {
		if (!$("#bm-own").length) { return; }
		$("#bm-own").on("change", show);
		$("#bm-add").on("click", function() {
			var $r = row({word: "", meaning: "destinations.High-Sec"});
			$("#bm-words").append($r);
			$r.find(".bm-word").trigger("focus");
		});
		$pane().on("click", ".bm-remove", function() { $(this).closest(".bm-row").remove(); checkDups(); tryIt(); });
		$pane().on("input change", ".bm-word, .bm-meaning", checkDups);
		$pane().on("input change", ".bm-word, .bm-meaning, #bm-try", tryIt);
	});

	return {render: render, save: save, read: read, current: current};
})();
