// Keyboard operation for the signature dialog.
//
// Additive on purpose: everything here hooks the dialog from outside rather
// than editing signature-dialog.js, so the dialog keeps every field and every
// behaviour it has today and this file can be deleted whole. The workflow does
// not change -- what changes is that it can be driven without the mouse.

(function() {
    var SIG = "#dialog-signature";

    // jQuery UI's autocomplete menu. While it is open Enter belongs to it, not
    // to the form.
    function suggestionOpen() {
        return $(".ui-autocomplete:visible, .ui-menu:visible").length > 0;
    }

    function isWormhole() {
        return $(SIG + " [name='signatureType']").val() === "wormhole";
    }

    // What has to be filled before the row is useful on the map. The signature
    // id always; for a wormhole also its type and where it leads, because those
    // are what the chain is drawn from. Name and the other side are optional.
    function requiredFields() {
        var names = ["signatureID_Alpha"];
        if (isWormhole()) { names.push("wormholeType", "leadsTo"); }
        return names
            .map(function(n) { return $(SIG + " [name='" + n + "']").filter(":visible").first(); })
            .filter(function($f) { return $f.length > 0; });
    }

    function markMissing() {
        $(SIG + " .sig-missing").removeClass("sig-missing");
        requiredFields().forEach(function($f) {
            if (!$.trim($f.val() || "")) { $f.addClass("sig-missing"); }
        });
    }

    // Land on the first thing still needing an answer rather than a fixed
    // field -- today focus goes to Name, which is optional, while Type and
    // Leads are what gate a usable chain.
    function focusFirstUnfilled() {
        var fields = requiredFields();
        for (var i = 0; i < fields.length; i++) {
            if (!$.trim(fields[i].val() || "")) {
                fields[i].trigger("focus").trigger("select");
                return;
            }
        }
        var $name = $(SIG + " [name='wormholeName'], " + SIG + " [name='signatureName']")
                        .filter(":visible").first();
        if ($name.length) { $name.trigger("focus"); }
    }

    // The next wormhole signature in this system that still has no type, so
    // Ctrl-Enter can walk a freshly pasted scan without touching the mouse.
    function nextUnfinished(afterId) {
        var sigs = tripwire.client && tripwire.client.signatures;
        var holes = (tripwire.client && tripwire.client.wormholes) || {};
        if (!sigs) { return null; }

        var systemID = sigDialogVM.viewingSystemID;
        var ids = Object.keys(sigs).filter(function(id) {
            var s = sigs[id];
            return s && s.systemID == systemID && s.type === "wormhole" && id != afterId;
        }).sort();

        for (var i = 0; i < ids.length; i++) {
            var hole = null;
            for (var w in holes) {
                if (holes[w].initialID == ids[i] || holes[w].secondaryID == ids[i]) { hole = holes[w]; break; }
            }
            if (!hole || !hole.type || hole.type === "????") { return ids[i]; }
        }
        return null;
    }

    function saveAndNext() {
        var current = sigDialogVM.sigId;
        var next = nextUnfinished(current);

        $("#form-signature").trigger("submit");

        if (next) {
            // Let the save round-trip settle before reopening, otherwise the
            // dialog's own close handler fights the reopen.
            setTimeout(function() {
                sigDialog.openSignatureDialog({data: {mode: "update", source: "next", signature: next}});
            }, 250);
        }
    }

    $(function() {
        // Enter commits from anywhere in the form. The dialog is already a
        // form, so this is mostly a matter of not letting the keystroke fall
        // through to the dialog chrome.
        $(document).on("keydown", "#form-signature", function(e) {
            if (e.key !== "Enter") { return; }
            if (suggestionOpen()) { return; }              // Enter is picking a suggestion
            if ($(e.target).is("textarea, button")) { return; }

            e.preventDefault();
            if (e.ctrlKey || e.metaKey) { saveAndNext(); }
            else { $("#form-signature").trigger("submit"); }
        });

        $(document).on("input change", "#form-signature", markMissing);

        $(document).on("dialogopen", ".ui-dialog", function() {
            if (!$(this).find(SIG).length) { return; }

            // Deferred: the dialog's own open handler populates fields, and
            // this has to run after it.
            setTimeout(function() {
                markMissing();
                focusFirstUnfilled();

                // Keep Delete off the keyboard path entirely. It sits beside
                // Save, and a mistyped Tab-Enter should never be able to
                // destroy a signature. It stays clickable.
                $(SIG).parent().find("button:contains('Delete')").attr("tabindex", "-1");
            }, 0);
        });
    });
})();
