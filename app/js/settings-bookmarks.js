// Settings > Bookmarks: the words this server reads in bookmark titles, and
// a pilot's own if they keep different ones. Each field is the words for one
// meaning, separated by commas or spaces. "Try one" reads a title live.
tripwire.settingsBookmarks = (function() {
	"use strict";
	var B = tripwire.bookmarks;
	var $pane = function() { return $("#dialog-options [data-pane=bookmarks]"); };

	function server() { return B.convention(window.TW_BOOKMARK_CONVENTION || {}, null); }

	function get(conv, path) {
		var p = path.split("."), v = conv[p[0]];
		return p.length > 1 ? (v || {})[p[1]] : v;
	}

	function fill(conv) {
		$pane().find("[data-bm]").each(function() { this.value = (get(conv, $(this).attr("data-bm")) || []).join(", "); });
		$("#bm-bare").prop("checked", conv.bareSiteNames !== false);
	}

	// The form as a convention, meaning -> words.
	function read() {
		var conv = {bareSiteNames: $("#bm-bare").prop("checked")};
		$pane().find("[data-bm]").each(function() {
			var p = $(this).attr("data-bm").split("."), words = B.list(this.value);
			if (p.length > 1) { (conv[p[0]] = conv[p[0]] || {})[p[1]] = words; } else { conv[p[0]] = words; }
		});
		return conv;
	}

	function own() { return $("#bm-own").prop("checked"); }

	// The convention the form stands for right now.
	function current() { return own() ? B.merge(B.DEFAULT, read()) : server(); }

	function lock() {
		$pane().find("[data-bm], #bm-bare").prop("disabled", !own());
		$pane().toggleClass("bm-following", !own());
	}

	function tryIt() {
		var text = $.trim($("#bm-try").val());
		if (!text) { return $("#bm-result").text("").removeClass("is-miss"); }
		var c = B.compile(current()), b = B.parse(text, c);
		$("#bm-result").text(B.describe(b, c, appData.systems, appData.regions, appData.genericSystemTypes)).toggleClass("is-miss", !b);
	}

	function render() {
		var mine = options.bookmarks || {}, srv = server();
		$("#bm-source").text(window.TW_BOOKMARK_CONVENTION ? "this server uses " + (srv.name || "its own") + "." : "this server uses the default.");
		$("#bm-own").prop("checked", !!mine.own);
		fill(mine.own && mine.convention ? B.merge(B.DEFAULT, mine.convention) : srv);
		lock();
		tryIt();
	}

	function save() {
		var mine = options.bookmarks || {};
		// The pilot's words are kept even while they follow the server, so
		// switching back restores them.
		options.bookmarks = {own: own(), convention: own() ? read() : (mine.convention || null)};
	}

	$(function() {
		if (!$("#bm-own").length) { return; }
		$("#bm-own").on("change", function() {
			// Starting your own begins from the server's words, or your last ones.
			var mine = options.bookmarks || {};
			fill(own() ? (mine.convention ? B.merge(B.DEFAULT, mine.convention) : server()) : server());
			lock(); tryIt();
		});
		$pane().on("input change", "[data-bm], #bm-bare, #bm-try", tryIt);
	});

	return {render: render, save: save, read: read, current: current};
})();
