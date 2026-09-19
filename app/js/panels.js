// The panel registry.
//
// Tripwire's four panels were declared only by their markup in tripwire.php,
// and the layout code found them by hard-coded id. This is the one place that
// says what panels exist, so adding one is a row here plus its markup, and the
// palette, the titles and the show/hide controls all follow from it.
//
// The grid itself already worked: gridster drags, resizes, serialises into
// options.grid and is restored in options.js before init. What was missing was
// a declaration, a way to hide a panel you don't use, and any visible sign
// that these are cards at all.

tripwire.panels = (function() {
    var PANELS = [
        {id: "infoWidget",       title: "System",     defaultVisible: true},
        {id: "signaturesWidget", title: "Signatures", defaultVisible: true},
        {id: "notesWidget",      title: "Notes",      defaultVisible: true},
        {id: "chainWidget",      title: "Chain",      defaultVisible: true}
    ];

    function def(id) {
        for (var i = 0; i < PANELS.length; i++) {
            if (PANELS[i].id === id) { return PANELS[i]; }
        }
        return null;
    }

    function store() {
        if (!options.panels) { options.panels = {}; }
        return options.panels;
    }

    function isVisible(id) {
        var saved = store();
        if (Object.prototype.hasOwnProperty.call(saved, id)) { return !!saved[id]; }
        var p = def(id);
        return !p || p.defaultVisible !== false;
    }

    // The three compact panels share one row and the chain spans another. The
    // saved order therefore has two useful states for the chain: before or
    // after the compact-panel row. Compact panels retain their own saved order.
    // CSS grid honours `order` on its items, so no markup moves.
    function order() {
        var saved = store().order;
        var ids = PANELS.map(function(p) { return p.id; });
        if (!Array.isArray(saved)) { return ids; }
        var known = saved.filter(function(id) { return ids.indexOf(id) > -1; });
        ids.forEach(function(id) { if (known.indexOf(id) < 0) { known.push(id); } });
        var chainFirst = known[0] === "chainWidget";
        var compact = known.filter(function(id) { return id !== "chainWidget"; });
        return chainFirst ? ["chainWidget"].concat(compact) : compact.concat(["chainWidget"]);
    }

    function move(id, dir) {
        var current = order();
        var compact = current.filter(function(x) { return x !== "chainWidget"; });

        // A full-width panel cannot sit between two compact panels without
        // creating a mostly empty third row. Its arrows move the whole chain
        // row above or below the compact row instead.
        if (id === "chainWidget") {
            store().order = dir < 0
                ? ["chainWidget"].concat(compact)
                : compact.concat(["chainWidget"]);
            apply();
            options.save();
            return;
        }

        var i = compact.indexOf(id);
        var j = i + dir;
        if (i < 0 || j < 0 || j >= compact.length) { return; }
        compact.splice(i, 1); compact.splice(j, 0, id);
        store().order = current[0] === "chainWidget"
            ? ["chainWidget"].concat(compact)
            : compact.concat(["chainWidget"]);
        apply();
        options.save();
    }

    function apply() {
        var ids = order();
        PANELS.forEach(function(p) {
            var $w = $("#" + p.id);
            $w.toggleClass("panel-hidden", !isVisible(p.id));
            $w.css("order", ids.indexOf(p.id));
        });
        // The grid gives its first row the fixed height and the second the
        // rest; when the chain leads, the rows swap roles (see the theme).
        $(".gridster > ul").toggleClass("chain-first", ids[0] === "chainWidget");
        $(document).trigger("panels:layout");
    }

    function setVisible(id, on) {
        store()[id] = !!on;
        apply();
        options.save();
    }

    function toggle(id) { setVisible(id, !isVisible(id)); }

    // Give each panel a titled header so it reads as a card rather than an
    // unlabelled box, and a control to put it away. Runs once; the title is
    // prepended into the existing .controls bar so no markup moves.
    function decorate() {
        PANELS.forEach(function(p) {
            var $w = $("#" + p.id);
            if (!$w.length) { return; }
            var $controls = $w.children(".controls").first();
            if (!$controls.length || $controls.children(".panel-title").length) { return; }

            $controls.prepend($('<span class="panel-title"></span>').text(p.title));

            $('<span class="panel-hide" role="button" tabindex="0" ' +
              'data-tooltip="Hide this panel">&times;</span>')
                .on("click keydown", function(e) {
                    if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") { return; }
                    e.preventDefault();
                    setVisible(p.id, false);
                })
                .appendTo($controls);
        });
    }

    $(function() {
        decorate();
        apply();
    });

    return {
        all: function() { return PANELS.slice(); },
        isVisible: isVisible,
        setVisible: setVisible,
        toggle: toggle,
        order: order,
        move: move,
        apply: apply
    };
})();
