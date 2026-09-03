// Panels, on the Display tab.
//
// The header's layout control opened a show/hide menu; drag-to-reorder went
// with gridster when the desktop became a CSS grid. Both belong in Settings:
// a row per panel with a switch for visibility and up/down for order among
// the top three. The chain always takes the full-width row beneath, so it
// has no arrows. Everything routes through tripwire.panels.

tripwire.settingsPanels = (function() {
	function render() {
		var $list = $("#panel-settings");
		if (!$list.length || !tripwire.panels) { return; }
		var defs = {}; tripwire.panels.all().forEach(function(p) { defs[p.id] = p; });
		var ids = tripwire.panels.order();
		var movable = ids.filter(function(id) { return id !== "chainWidget"; });
		$list.empty();
		ids.forEach(function(id) {
			var p = defs[id]; if (!p) { return; }
			var on = tripwire.panels.isVisible(id);
			var $row = $('<div class="panel-row"></div>').attr("data-panel", id);
			$row.append($('<span class="panel-row-name"></span>').text(p.title));
			var $acts = $('<span class="panel-row-actions"></span>');
			if (id !== "chainWidget") {
				var i = movable.indexOf(id);
				$('<button type="button" class="char-btn" aria-label="Move up">&#9650;</button>')
					.prop("disabled", i === 0)
					.on("click", function() { tripwire.panels.move(id, -1); render(); })
					.appendTo($acts);
				$('<button type="button" class="char-btn" aria-label="Move down">&#9660;</button>')
					.prop("disabled", i === movable.length - 1)
					.on("click", function() { tripwire.panels.move(id, 1); render(); })
					.appendTo($acts);
			} else {
				$('<span class="char-note"></span>').text("Full width, below").appendTo($acts);
			}
			var $sw = $('<label class="switch"><input type="checkbox" /><span class="switch-track"></span></label>');
			$sw.find("input").prop("checked", on).on("change", function() {
				tripwire.panels.setVisible(id, this.checked);
			});
			$acts.append($sw);
			$row.append($acts);
			$list.append($row);
		});
	}
	return {render: render};
})();
