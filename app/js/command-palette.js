// Command palette and the bare-key layer.
//
// Renders entirely from tripwire.keyboard, so what the palette lists, what the
// keys do, and what "?" prints are the same list by construction.

(function() {
    var $palette, $input, $list, $help, items = [], cursor = 0;

    function build() {
        $palette = $(
            '<div id="cmd-palette" class="hidden" role="dialog" aria-modal="true" aria-label="Command palette">' +
              '<div class="cmd-box">' +
                '<input id="cmd-input" type="text" autocomplete="off" spellcheck="false" ' +
                       'placeholder="Type a command, or a system name to jump to…" aria-label="Command" />' +
                '<ul id="cmd-list" role="listbox"></ul>' +
                '<div class="cmd-foot"><span><b>↑↓</b> move</span><span><b>↵</b> run</span>' +
                  '<span><b>esc</b> close</span><span><b>?</b> shortcuts</span></div>' +
              '</div>' +
            '</div>').appendTo("body");

        $input = $palette.find("#cmd-input");
        $list  = $palette.find("#cmd-list");

        // Clicking the backdrop closes; clicking inside must not.
        $palette.on("mousedown", function(e) { if (e.target === $palette[0]) { close(); } });
        $input.on("input", function() { render($input.val()); });
        $list.on("mousedown", "li", function(e) { e.preventDefault(); run($(this).index()); });

        $help = $(
            '<div id="cmd-help" class="hidden" role="dialog" aria-label="Keyboard shortcuts">' +
              '<div class="cmd-box"><h2>Keyboard shortcuts</h2><table>' +
              tripwire.keyboard.bindings.map(function(b) {
                  return "<tr><th>" + b.keys + "</th><td>" + b.does + "</td></tr>";
              }).join("") +
              '</table><p>Every command is also in the palette — press <b>/</b>.</p></div>' +
            '</div>').appendTo("body");

        $help.on("mousedown", function(e) { if (e.target === $help[0]) { $help.addClass("hidden"); } });
    }

    function candidates(query) {
        var q = (query || "").toLowerCase().trim();
        var acts = tripwire.keyboard.actions.filter(function(a) {
            return !q || a.label.toLowerCase().indexOf(q) > -1 || a.group.toLowerCase().indexOf(q) > -1;
        });
        return acts.concat(tripwire.keyboard.systemActions(q));
    }

    function render(query) {
        items = candidates(query);
        cursor = 0;
        if (!items.length) {
            $list.html('<li class="cmd-empty" role="presentation">No matching command</li>');
            return;
        }
        $list.html(items.map(function(a, i) {
            var off = a.enabled && !a.enabled();
            return '<li role="option" class="' + (i === 0 ? "sel " : "") + (off ? "off " : "") +
                   (a.destructive ? "danger" : "") + '" aria-selected="' + (i === 0) + '">' +
                     '<span class="cmd-label">' + a.label + '</span>' +
                     '<span class="cmd-group">' + a.group + '</span>' +
                     (a.keys ? '<span class="cmd-keys">' + a.keys + '</span>' : '') +
                   '</li>';
        }).join(""));
    }

    function move(delta) {
        if (!items.length) { return; }
        cursor = (cursor + delta + items.length) % items.length;
        $list.children().removeClass("sel").attr("aria-selected", "false")
             .eq(cursor).addClass("sel").attr("aria-selected", "true")[0]
             .scrollIntoView({block: "nearest"});
    }

    function run(i) {
        var a = items[i];
        if (!a) { return; }
        if (a.enabled && !a.enabled()) { return; }   // listed but unavailable
        close();
        a.perform();
    }

    function open() {
        $help.addClass("hidden");
        $palette.removeClass("hidden");
        $input.val("");
        render("");
        $input.focus();
    }

    function close() {
        $palette.addClass("hidden");
        $input.blur();
    }

    function isOpen() { return $palette && !$palette.hasClass("hidden"); }

    $(function() {
        build();

        // Keys inside the palette. Bound to the input so they never reach the
        // global handler below.
        $input.on("keydown", function(e) {
            if (e.key === "Escape")     { e.preventDefault(); close(); }
            else if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
            else if (e.key === "ArrowUp")   { e.preventDefault(); move(-1); }
            else if (e.key === "Enter")     { e.preventDefault(); run(cursor); }
        });

        // Global layer. Stands down whenever the keystroke belongs to a field
        // or an open dialog, which is what makes it safe to use bare keys.
        $(document).on("keydown.cmdPalette", function(e) {
            // Escape closes whatever is open, wherever focus happens to be --
            // the input's own handler covers the normal case, this covers focus
            // having moved elsewhere.
            if (e.key === "Escape") {
                if (!$help.hasClass("hidden")) { $help.addClass("hidden"); return; }
                if (isOpen()) { close(); return; }
            }
            if (isOpen() || tripwire.keyboard.isTyping(e.target)) { return; }

            if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
                e.preventDefault();
                open();
            } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === "/") {
                e.preventDefault();
                open();
            } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === "?") {
                e.preventDefault();
                $help.toggleClass("hidden");
            }
        });
    });
})();
