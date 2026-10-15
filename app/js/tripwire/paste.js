// Handles pasting sigs from EVE
tripwire.pasteSignatures = function() {
    var processing = false;

    var rowParse = function(row) {
        var scanner = {};
        var columns = row.split("	"); // Split by tab
        var validScanGroups = [
            // English (en-us)
            "Cosmic Signature",
            "Cosmic Anomaly",

            // French (fr)
            "Signature cosmique",
            "Anomalie cosmique",

            // German (de)
            "Kosmische Anomalie",
            "Kosmische Signatur",

            // Japanese (ja)
            "宇宙の特異点",
            "宇宙のシグネチャ",

            // Korean (ko)
            "코즈믹 시그니처",
            "코즈믹 어노말리",

            // Russian (ru)
            "Скрытый сигнал",
            "Космическая аномалия",
        ];

        var validTypes = {
            // English (en-us)
            "Combat Site": "Combat",
            "Data Site": "Data",
            "Gas Site": "Gas",
            "Ore Site": "Ore",
            "Relic Site": "Relic",
            "Wormhole": "Wormhole",

            // French (fr)
            "Site de combat": "Combat",
            "Site de données": "Data",
            "Site de collecte de gaz": "Gas",
            "Site de minerai": "Ore",
            "Site de reliques": "Relic",
            "Trou de ver": "Wormhole",

            // German (de)
            "Kampfgebiet": "Combat",
            "Datengebiet": "Data",
            "Gasgebiet": "Gas",
            "Mineraliengebiet": "Ore",
            "Reliktgebiet": "Relic",
            "Wurmloch": "Wormhole",

            // Japanese (ja)
            "戦闘サイト": "Combat",
            "データサイト": "Data",
            "ガスサイト": "Gas",
            "鉱石サイト": "Ore",
            "遺物サイト": "Relic",
            "ワームホール": "Wormhole",

            // Korean (ko)
            "전투 사이트": "Combat",
            "데이터 사이트": "Data",
            "가스 사이트": "Gas",
            "채광 사이트": "Ore",
            "유물 사이트": "Relic",
            "웜홀": "Wormhole",

            // Russian (ru)
            "Боевой район": "Combat",
            "Информационный район": "Data",
            "Газовый район": "Gas",
            "Астероидный район": "Ore",
            "Археологический район": "Relic",
            "Червоточина": "Wormhole",
        };

        for (var x in columns) {
            if (columns[x].match(/^([A-Z]{3}[-]\d{3})$/)) {
                scanner.id = columns[x].split("-");
                continue;
            }

            if (columns[x].match(/(\d([.|,]\d)?[ ]?(%))/) || columns[x].match(/(\d[.|,]?\d+\s?(UA|AU|AE|km|m|а.е.|км|м))/i)) { // Exclude scan % || AU
                continue;
            }

            if ($.inArray(columns[x], validScanGroups) != -1) {
                scanner.scanGroup = columns[x];
                continue;
            }

            if (validTypes[columns[x]]) {
                scanner.type = validTypes[columns[x]];
                continue;
            }

            if (columns[x] != "") {
                scanner.name = columns[x].trim();
            }
        }

        if (!scanner.id || scanner.id.length !== 2) {
            return false;
        }

        return scanner;
    }

    this.pasteSignatures.parsePaste = function(paste) {
        var paste = paste.split("\n");
        var payload = {"signatures": {"add": [], "update": []}, "systemID": viewingSystemID};
        var undo = [];
        var pendingHoles = [];   // scanned wormholes with no existing row: candidates for a placeholder
        processing = true;

        for (var i in paste) {
            var scanner = rowParse(paste[i]);

            if (scanner.id) {
                var signature = $.map(tripwire.client.signatures, function(signature) { if (signature.signatureID && signature.signatureID.toUpperCase() == scanner.id[0] + scanner.id[1] && signature.systemID == viewingSystemID) return signature; })[0];
                if (signature) {
                    // Update signature (only non-wormholes can be updated to a wormhole)
                    if (scanner.type == "Wormhole" && signature.type != "wormhole") {
                        var wormhole = $.map(tripwire.client.wormholes, function(wormhole) { if (wormhole.initialID == signature.id || wormhole.secondaryID == signature.id) return wormhole; })[0] || {};
                        var otherSignature = wormhole.id ? (signature.id == wormhole.initialID ? tripwire.client.signatures[wormhole.secondaryID] : tripwire.client.signatures[wormhole.initialID]) : {};
                        payload.signatures.update.push({
                            "wormhole": {
                                "id": wormhole.id || null,
                                "type": wormhole.type || null,
                                "life": wormhole.life || "stable",
                                "mass": wormhole.mass || "stable"
                            },
                            "signatures": [
                                {
                                    "id": signature.id,
                                    "signatureID": signature.signatureID,
                                    "systemID": viewingSystemID,
                                    "type": "wormhole",
                                    "name": signature.name
                                },
                                {
                                    "id": otherSignature.id || null,
                                    "signatureID": otherSignature.signatureID || null,
                                    "systemID": otherSignature.systemID || null,
                                    "type": "wormhole",
                                    "name": otherSignature.name
                                }
                            ]
                        });

                        if (tripwire.client.wormholes[wormhole.id]) {
							undo.push({"wormhole": tripwire.client.wormholes[wormhole.id], "signatures": [tripwire.client.signatures[signature.id], tripwire.client.signatures[otherSignature.id]]});
						} else {
							// used to be just a regular signature
							undo.push(tripwire.client.signatures[signature.id]);
						}
                    // Make sure we are only updating when we have new info (we never turn wormholes into regular signatures)
                    } else if (signature.type != "wormhole" && ((scanner.type && scanner.type.toLowerCase() != signature.type) || (scanner.name && scanner.name != signature.name))) {
                        payload.signatures.update.push({
                            "id": signature.id,
                            "systemID": viewingSystemID,
                            "type": scanner.type || 'unknown',
                            "name": scanner.name,
                            "lifeLength": options.signatures.pasteLife * 60 * 60
                        });
                        undo.push(tripwire.client.signatures[signature.id]);
                    }
                } else {
                    // Add signature
                    if (scanner.type == "Wormhole") {
                        var addition = {
                            "wormhole": {
                                "type": null,
                                "parent": "initial",
                                "life": "stable",
                                "mass": "stable"
                            },
                            "signatures": [
                                {
                                    "signatureID": scanner.id[0] + scanner.id[1],
                                    "systemID": viewingSystemID,
                                    "type": "wormhole",
                                    "lifeLength": options.signatures.pasteLife * 60 * 60
                                },
                                {
                                    "signatureID": null,
                                    "systemID": null,
                                    "type": "wormhole",
                                    "lifeLength": options.signatures.pasteLife * 60 * 60
                                }
                            ]
                        };
                        payload.signatures.add.push(addition);
                        pendingHoles.push({signatureID: scanner.id[0] + scanner.id[1], add: addition});
                    } else {
                        payload.signatures.add.push({
                            "signatureID": scanner.id[0] + scanner.id[1],
                            "systemID": viewingSystemID,
                            "type": scanner.type || 'unknown',
                            "name": scanner.name,
                            "lifeLength": options.signatures.pasteLife * 60 * 60
                        });
                    }
                }
            }
        }

        // The auto-mapper draws a connection before anyone scans it, leaving a
        // signature with no id on this side. A scan that then arrives with a
        // wormhole in it is usually that hole. Ask which, and merge: the
        // placeholder takes the scanned id, nothing is deleted, the map keeps
        // its shape. Only placeholders are candidates; a scanned hole never
        // offers to overwrite a connection someone already identified.
        var placeholders = pendingHoles.length ? tripwire.pasteSignatures.placeholders() : [];
        if (pendingHoles.length && placeholders.length) {
            tripwire.pasteSignatures.matchDialog(pendingHoles, placeholders, payload, undo);
            return;
        }
        tripwire.pasteSignatures.submit(payload, undo);
    };

    // Unidentified wormhole signatures in the viewed system, with their far side.
    this.pasteSignatures.placeholders = function() {
        var out = [];
        $.each(tripwire.client.wormholes || {}, function(_, wh) {
            if (wh.type === "GATE") { return; }
            var a = tripwire.client.signatures[wh.initialID], b = tripwire.client.signatures[wh.secondaryID];
            if (!a || !b) { return; }
            var local = a.systemID == viewingSystemID ? a : (b.systemID == viewingSystemID ? b : null);
            if (!local || (local.signatureID && local.signatureID !== "???")) { return; }
            out.push({wormhole: wh, local: local, other: local === a ? b : a});
        });
        return out;
    };

    this.pasteSignatures.describePlaceholder = function(p) {
        var sys = tripwire.systems[p.other.systemID];
        var where = sys ? sys.name + (appData.systems[p.other.systemID] && appData.systems[p.other.systemID].class ? " (C" + appData.systems[p.other.systemID].class + ")" : "")
                        : (appData.genericSystemTypes[p.other.systemID] || "unknown destination");
        var type = p.wormhole.type && p.wormhole.type !== "????" ? " \u00b7 " + p.wormhole.type : "";
        var life = tripwire.wormholeState ? " \u00b7 " + tripwire.wormholeState.lifeState(p.wormhole, p.local).label : "";
        return "\u2192 " + where + type + life;
    };

    // Turn a chosen match into one update (placeholder takes the scanned id)
    // and drop the scanned hole's add.
    this.pasteSignatures.merge = function(payload, undo, pending, p) {
        var i = payload.signatures.add.indexOf(pending.add);
        if (i !== -1) { payload.signatures.add.splice(i, 1); }
        payload.signatures.update.push({
            "wormhole": {"id": p.wormhole.id, "type": p.wormhole.type, "life": p.wormhole.life, "mass": p.wormhole.mass},
            "signatures": [
                {"id": p.local.id, "signatureID": pending.signatureID, "systemID": viewingSystemID, "type": "wormhole", "name": p.local.name},
                {"id": p.other.id, "signatureID": p.other.signatureID, "systemID": p.other.systemID, "type": "wormhole", "name": p.other.name}
            ]
        });
        undo.push({"wormhole": p.wormhole, "signatures": [p.local, p.other]});
    };

    this.pasteSignatures.matchDialog = function(pending, placeholders, payload, undo) {
        var $d = $("#dialog-match-holes"), $rows = $("#matchHolesRows").empty();
        var systemName = tripwire.systems[viewingSystemID] ? tripwire.systems[viewingSystemID].name : "this system";
        $("#matchHolesLead").text(systemName + " has " + placeholders.length + (placeholders.length === 1 ? " auto-mapped connection with no scanned id" : " auto-mapped connections with no scanned id") + ". Which of these is which?");
        pending.forEach(function(item, idx) {
            $("<span class='match-sig'></span>").text(formatSignatureID(item.signatureID)).appendTo($rows);
            var $sel = $("<select></select>").attr("data-pending", idx).appendTo($rows);
            $("<option value=''></option>").text("New connection").appendTo($sel);
            placeholders.forEach(function(p) { $("<option></option>").val(String(p.wormhole.id)).text(tripwire.pasteSignatures.describePlaceholder(p)).appendTo($sel); });
            // One scanned hole and one placeholder: almost certainly the same hole.
            if (pending.length === 1 && placeholders.length === 1) { $sel.val(String(placeholders[0].wormhole.id)); }
        });
        // A placeholder can be claimed once.
        $rows.off("change").on("change", "select", function() {
            var taken = {};
            $rows.find("select").each(function() { if (this.value) { taken[this.value] = (taken[this.value] || 0) + 1; } });
            $rows.find("select").each(function() {
                var mine = this.value;
                $(this).find("option").each(function() { this.disabled = !!(this.value && this.value !== mine && taken[this.value]); });
            });
        }).find("select").first().trigger("change");

        if (!$d.hasClass("ui-dialog-content")) {
            $d.dialog({
                resizable: false, minHeight: 0, width: 460, modal: true,
                dialogClass: "dialog-noeffect ui-dialog-shadow",
                buttons: {
                    Import: function() {
                        var state = $d.data("match");
                        $rows.find("select").each(function() {
                            var item = state.pending[parseInt($(this).attr("data-pending"), 10)];
                            var p = this.value ? state.placeholders.filter(function(c) { return String(c.wormhole.id) === String(this.value); }.bind(this))[0] : null;
                            if (item && p) { tripwire.pasteSignatures.merge(state.payload, state.undo, item, p); }
                        });
                        $d.dialog("close");
                        tripwire.pasteSignatures.submit(state.payload, state.undo);
                    },
                    Cancel: function() { $d.dialog("close"); processing = false; }
                },
                open: function() { $d.parent().find(".ui-dialog-buttonpane button:contains('Import')").first().focus(); }
            });
        }
        $d.data("match", {pending: pending, placeholders: placeholders, payload: payload, undo: undo});
        $d.dialog("open");
    };

    this.pasteSignatures.submit = function(payload, undo) {
        if (payload.signatures.add.length || payload.signatures.update.length) {
            var success = function(data) {
                if (data.resultSet && data.resultSet[0].result == true) {
                    $("#undo").removeClass("disabled");

                    if (data.results) {
                        if (viewingSystemID in tripwire.signatures.undo) {
                            tripwire.signatures.undo[viewingSystemID].push({action: "add", signatures: data.results});
                        } else {
                            tripwire.signatures.undo[viewingSystemID] = [{action: "add", signatures: data.results}];
                        }
                    }

                    if (undo.length) {
                        if (viewingSystemID in tripwire.signatures.undo) {
                            tripwire.signatures.undo[viewingSystemID].push({action: "update", signatures: undo});
						} else {
                            tripwire.signatures.undo[viewingSystemID] = [{action: "update", signatures: undo}];
						}
                    }

                    sessionStorage.setItem("tripwire_undo", JSON.stringify(tripwire.signatures.undo));
                }
            }

            var always = function(data) {
                processing = false;
            }

            tripwire.refresh('refresh', payload, success, always);
        } else {
            processing = false;
        }
    }

    this.pasteSignatures.init = function() {
        $(document).keydown(function(e)	{
            if ((e.metaKey || e.ctrlKey) && (e.keyCode == 86 || e.keyCode == 91) && !processing) {
                // Do not steal a normal paste from anything the user can edit.
                // Notes are a contenteditable div, not a textarea; moving focus
                // to #clipboard here made the importer eat the note text.
                if (tripwire.keyboard.isTyping(e.target)) return;

                $("#clipboard").focus();
            }
        });

        $("body").on("click", "#fullPaste", function(e) {
            e.preventDefault();

            var paste = $(this).data("paste").split("\n");
            var pasteIDs = [];
            var removes = [];
            var undo = [];

            for (var i in paste) {
                if (scan = rowParse(paste[i])) {
                    pasteIDs.push((scan.id[0] + scan.id[1]).toLowerCase());
                }
            }

            for (var i in tripwire.client.signatures) {
                var signature = tripwire.client.signatures[i];

                if (signature.systemID == viewingSystemID && signature.signatureID && $.inArray(signature.signatureID.toLowerCase(), pasteIDs) === -1 && signature.signatureID !== "???") {
                    if (signature.type == "wormhole") {
                        var wormhole = $.map(tripwire.client.wormholes, function(wormhole) { if (wormhole.initialID == signature.id || wormhole.secondaryID == signature.id) return wormhole; })[0] || {};
                        var otherSignature = wormhole.id ? (signature.id == wormhole.initialID ? tripwire.client.signatures[wormhole.secondaryID] : tripwire.client.signatures[wormhole.initialID]) : {};
                        if (wormhole.type !== "GATE") {
                            removes.push(wormhole);
                            undo.push({"wormhole": wormhole, "signatures": [signature, otherSignature]});
                        }
                    } else {
                        removes.push(signature.id);
                        undo.push(signature);
                    }
                }
            }

            if (removes.length > 0) {
                var payload = {"signatures": {"remove": removes}};

                var success = function(data) {
                    if (data.resultSet && data.resultSet[0].result == true) {
                        $("#undo").removeClass("disabled");
                        if (viewingSystemID in tripwire.signatures.undo) {
                            tripwire.signatures.undo[viewingSystemID].push({action: "remove", signatures: undo});
                        } else {
                            tripwire.signatures.undo[viewingSystemID] = [{action: "remove", signatures: undo}];
                        }

                        sessionStorage.setItem("tripwire_undo", JSON.stringify(tripwire.signatures.undo));
                    }
                }

                tripwire.refresh('refresh', payload, success);
            }
        });

        $("#clipboard").on("paste", function(e) {
            e.preventDefault();
            var paste = window.clipboardData ? window.clipboardData.getData("Text") : (e.originalEvent || e).clipboardData.getData('text/plain');

            $("#clipboard").blur();
            Notify.trigger("Paste detected<br/>(<a id='fullPaste' href=''>Click to delete missing sigs</a>)");
            $("#fullPaste").data("paste", paste);
            tripwire.pasteSignatures.parsePaste(paste);
        });
    }

    this.pasteSignatures.init();
}
tripwire.pasteSignatures();
