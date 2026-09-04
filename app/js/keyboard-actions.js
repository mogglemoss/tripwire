// The single source of truth for what the keyboard can do.
//
// Both the command palette and the bare-key handler render from this file, and
// so does the "?" overlay, so bindings and their documentation cannot drift
// apart. Every action dispatches the control the mouse would have used -- this
// layer adds ways to invoke behaviour, never new behaviour.

tripwire.keyboard = (function() {
    // A control counts as unavailable when it is missing, hidden, or carries
    // the app's own .disabled marker (undo/redo/automapper use it).
    function control(selector) {
        var $el = $(selector);
        return $el.length && !$el.hasClass("disabled") && $el.is(":visible") ? $el : null;
    }

    function click(selector) {
        return {
            enabled: function() { return !!control(selector); },
            perform: function() {
                var $el = control(selector);
                if ($el) { $el.click(); }
            }
        };
    }

    // id, label and group are what the palette lists; keys is what the bare-key
    // handler binds and what the "?" overlay prints.
    var ACTIONS = [
        {id: "add-signature",    label: "Add signature",              group: "Signatures", keys: null,  target: "#add-signature"},
        {id: "edit-signature",   label: "Edit selected signature",    group: "Signatures", keys: null,  target: "#edit-signature"},
        {id: "delete-signature", label: "Delete selected signature",  group: "Signatures", keys: null,  target: "#delete-signature", destructive: true},
        {id: "undo",             label: "Undo last signature change", group: "Signatures", keys: "Ctrl+Z", target: "#undo"},
        {id: "redo",             label: "Redo signature change",      group: "Signatures", keys: "Ctrl+Y", target: "#redo"},

        {id: "toggle-automapper", label: "Toggle auto-mapper",        group: "Chain",      keys: null,  target: "#toggle-automapper"},
        {id: "show-viewing",      label: "Add current system to chain", group: "Chain",    keys: null,  target: "#show-viewing"},
        {id: "show-favorite",     label: "Add favourites to chain",   group: "Chain",      keys: null,  target: "#show-favorite"},
        {id: "new-tab",           label: "New chain tab",             group: "Chain",      keys: null,  target: "#newTab"},

        {id: "search",            label: "Toggle system search",      group: "Navigate",   keys: null,  target: "#search"},
        {id: "follow",            label: "Follow my in-game system",  group: "Navigate",   keys: null,  target: "#follow"},
        {id: "favorite",          label: "Add or remove favourite",   group: "Navigate",   keys: null,  target: "#system-favorite"},
        {id: "favorites",         label: "Show all favourites",       group: "Navigate",   keys: null,  target: "#favorite-dropdown-toggle"},

        {id: "add-comment",       label: "Add comment",               group: "Comments",   keys: null,  target: "#add-comment"},
        {id: "sort-comments",     label: "Sort comments by date",     group: "Comments",   keys: null,  target: "#comment-sort"},

        {id: "settings",          label: "Settings",                  group: "App",        keys: null,  target: "#settings"},
        {id: "mask",              label: "Switch mask",               group: "App",        keys: null,  target: "#mask-menu-link"}
    ].map(function(a) { return $.extend(a, click(a.target)); });

    // Bare-key bindings. Deliberately no destructive key: a stray press must
    // never delete a signature, so deletion is reachable only from the palette,
    // where invoking it is a two-step. Matches the same rule in Aperture.
    var KEY_BINDINGS = [
        {keys: "/",        does: "Open the command palette"},
        {keys: "Ctrl+K",   does: "Open the command palette"},
        {keys: "?",        does: "Show this list"},
        {keys: "Esc",      does: "Close the palette or this list"},
        {keys: "Ctrl+Z",   does: "Undo last signature change"},
        {keys: "Ctrl+Y",   does: "Redo signature change"},
        {keys: "Ctrl+A",   does: "Select all signatures"},
        {keys: "Ctrl+C",   does: "Copy selected signatures"}
    ];

    // Jumping to a system is generated rather than declared -- one entry per
    // known system, resolved lazily so the palette does not build ~8000 rows
    // until someone actually types.
    function systemActions(query) {
        if (!query || query.length < 2 || !tripwire.systems) { return []; }
        var q = query.toLowerCase(), out = [];
        for (var id in tripwire.systems) {
            var name = tripwire.systems[id] && tripwire.systems[id].name;
            if (!name) { continue; }
            if (name.toLowerCase().indexOf(q) === 0) {
                out.push({
                    id: "jump-" + id,
                    label: name,
                    group: "Jump to system",
                    enabled: function() { return true; },
                    perform: (function(n) {
                        return function() { window.location = "?system=" + encodeURIComponent(n); };
                    })(name)
                });
                if (out.length >= 8) { break; }
            }
        }
        return out;
    }

    // True when a keystroke belongs to something else: a field being typed in,
    // or an open dialog. The dialog test cannot be a tag test -- jQuery UI's
    // dialogs put focus on plain containers, so match the role/class instead.
    function isTyping(target) {
        var $t = $(target);
        return $t.is("input, textarea, select, [contenteditable=true]") ||
               $t.closest("[role='dialog'], .ui-dialog, .cke").length > 0;
    }

    // Panel show/hide, generated from the panel registry rather than declared
    // here, so adding a panel adds its command for free. Resolved lazily
    // because panels.js loads after this file.
    function panelActions() {
        if (!tripwire.panels) { return []; }
        return tripwire.panels.all().map(function(p) {
            return {
                id: "panel-" + p.id,
                label: (tripwire.panels.isVisible(p.id) ? "Hide " : "Show ") + p.title + " panel",
                group: "Panels",
                enabled: function() { return true; },
                perform: function() { tripwire.panels.toggle(p.id); }
            };
        });
    }

    // Jump to a chain tab by name.
    function chainTabActions() {
        return $("#chainTabs .tab").map(function(i, t) {
            var name = $(t).find(".name").text().trim();
            return {
                id: "chain-tab-" + i, label: "Chain: " + name, group: "Chain",
                enabled: function() { return true; },
                perform: function() { if (window.chain && chain.setActiveTab) { chain.setActiveTab(i); } }
            };
        }).get();
    }

    // Switch mask by name.
    function maskActions() {
        return $("#mask-menu-mask-list a").map(function(i, a) {
            var $m = $(a).find(".mask"), name = $m.text().trim();
            return {
                id: "mask-" + $m.data("mask"), label: "Mask: " + name, group: "App",
                enabled: function() { return !$(a).hasClass("active"); },
                perform: function() { $(a).trigger("click"); }
            };
        }).get();
    }

    // Life and mass on the selected wormhole rows, without the dialog.
    function selectionActions() {
        var $rows = $("#sigTable tbody tr.selected");
        if (!$rows.length || !tripwire.signaturePayload) { return []; }
        var whs = $rows.map(function() { var w = tripwire.signaturePayload.wormholeForSignature($(this).data("id")); return w ? w.id : null; }).get();
        if (!whs.length) { return []; }
        var set = function(field, value, label) {
            return {
                id: "sel-" + field + "-" + value, label: label + (whs.length > 1 ? " (" + whs.length + " wormholes)" : ""), group: "Selected wormhole",
                enabled: function() { return true; },
                // The same sequence as the inline editor: build the payload, send
                // it, and record the undo entry only once the server accepts it.
                perform: function() {
                    var systemID = viewingSystemID;
                    whs.forEach(function(id) {
                        var c = {}; c[field] = value;
                        var built = tripwire.signaturePayload.changeWormhole(id, c);
                        if (!built) { return; }
                        tripwire.refresh("refresh", built.payload, function(data) {
                            if (data && data.resultSet && data.resultSet[0] && data.resultSet[0].result == true) {
                                tripwire.signaturePayload.recordUndo(systemID, "update", built.undo);
                            }
                        });
                    });
                }
            };
        };
        return [set("life", "stable", "Life: stable"), set("life", "critical", "Life: end of life"),
                set("mass", "stable", "Mass: stable"), set("mass", "destab", "Mass: destabilised"), set("mass", "critical", "Mass: critical")];
    }

    return {
        actions: ACTIONS,
        panelActions: panelActions,
        chainTabActions: chainTabActions,
        maskActions: maskActions,
        selectionActions: selectionActions,
        bindings: KEY_BINDINGS,
        systemActions: systemActions,
        isTyping: isTyping
    };
})();
