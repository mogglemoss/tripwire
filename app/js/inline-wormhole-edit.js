// Life and mass, edited on the row.
//
// These are the two wormhole fields that change during a session -- a hole
// goes end-of-life, mass goes critical -- and until now each change meant
// double-click, wait for the dialog, change one field, save. On a tablet the
// dialog is the whole workflow. Click the cell, pick from a chip set, done.
//
// The payload and the undo entry come from tripwire.signaturePayload, the
// same module the dialog uses, built from the records the client already
// holds with one field changed. Nothing here knows the shape of an update.
//
// Leads-to is not edited here: it needs the system autocomplete and the
// wormhole-type inference the dialog does, and that stays in the dialog.

(function() {
	// The states and their labels live in tripwire.wormholeState; life is a
	// preset over the expiry, mass a plain value.
	var FIELDS = {
		5: {key: "life", options: function() { return tripwire.wormholeState.LIFE; },
		    current: function(wh, sig) { return tripwire.wormholeState.presetFor(wh, sig); },
		    changes: function(value) { return tripwire.wormholeState.lifeChanges(value); }},
		6: {key: "mass", options: function() { return tripwire.wormholeState.MASS; },
		    current: function(wh) { return wh.mass; },
		    changes: function(value) { return {mass: value}; }}
	};

	function close() {
		$("#inline-edit").remove();
		$(document).off("mousedown.inlineEdit keydown.inlineEdit");
	}

	function open($td, field, wormhole, sig) {
		close();

		var $pop = $('<div id="inline-edit" role="listbox"></div>')
			.attr("aria-label", "Set " + field.key);

		var selected = field.current(wormhole, sig);
		field.options().forEach(function(opt) {
			var current = selected === opt.value;
			$('<button type="button" role="option"></button>')
				.addClass("inline-chip " + opt.cls)
				.attr("aria-selected", current ? "true" : "false")
				.text(opt.label)
				.on("click", function(e) {
					e.preventDefault(); e.stopPropagation();
					if (!current) { apply(wormhole.id, field.changes(opt.value), $td); }
					close();
				})
				.appendTo($pop);
		});

		$("body").append($pop);

		var r = $td[0].getBoundingClientRect();
		$pop.css({
			top: Math.round(r.bottom + 4) + "px",
			left: Math.round(Math.min(r.left, window.innerWidth - $pop.outerWidth() - 8)) + "px"
		});
		$pop.find("[aria-selected=true]").trigger("focus");

		setTimeout(function() {
			$(document).on("mousedown.inlineEdit", function(e) {
				if (!$(e.target).closest("#inline-edit").length) { close(); }
			});
			$(document).on("keydown.inlineEdit", function(e) {
				if (e.key === "Escape") { close(); }
			});
		}, 0);
	}

	function apply(wormholeId, changes, $td) {
		var built = tripwire.signaturePayload.changeWormhole(wormholeId, changes);
		if (!built) { return; }

		$td.addClass("is-saving");
		var systemID = viewingSystemID;

		var success = function(data) {
			if (data.resultSet && data.resultSet[0].result == true) {
				tripwire.signaturePayload.recordUndo(systemID, "update", built.undo);
			}
		};
		var always = function() { $td.removeClass("is-saving"); };

		tripwire.refresh("refresh", built.payload, success, always);
	}

	$(function() {
		// Delegated: rows are re-rendered by the refresh cycle.
		$("#sigTable").on("click", "tbody tr[data-id] > td:nth-child(5), tbody tr[data-id] > td:nth-child(6)", function(e) {
			var $td = $(this), $tr = $td.closest("tr");
			// Non-wormhole rows span leads-to across these columns and have no 5th cell.
			if ($tr.children("td").length < 6) { return; }
			var sig = tripwire.client.signatures[$tr.data("id")];
			if (!sig || sig.type !== "wormhole") { return; }
			var wh = tripwire.signaturePayload.wormholeForSignature(sig.id);
			if (!wh) { return; }

			e.preventDefault();
			e.stopPropagation();   // a click here is an edit, not a row selection
			open($td, FIELDS[$td.index() + 1], wh, sig);
		});

		// Mark the cells so they read as editable.
		var tag = function() {
			$("#sigTable tbody tr[data-id]").each(function() {
				var $tr = $(this);
				if ($tr.children("td").length >= 6) {
					$tr.children("td").slice(4, 6).addClass("inline-editable");
				}
			});
		};
		tag();
		var target = document.getElementById("sigTable");
		if (target && window.MutationObserver) {
			var pending = null;
			new MutationObserver(function() { clearTimeout(pending); pending = setTimeout(tag, 60); })
				.observe(target, {childList: true, subtree: true});
		}
	});
})();
