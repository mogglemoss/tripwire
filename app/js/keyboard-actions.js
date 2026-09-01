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
        {id: "layout",            label: "Customise layout",          group: "App",        keys: null,  target: "#layout"},
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

    return {
        actions: ACTIONS,
        bindings: KEY_BINDINGS,
        systemActions: systemActions,
        isTyping: isTyping
    };
})();
