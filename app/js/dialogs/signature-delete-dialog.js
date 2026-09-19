$("#signaturesWidget").on("click", "#delete-signature", function(e) {
	e.preventDefault();

	if ($(this).closest("tr").attr("disabled")) {
		return false;
	} else if ($("#sigTable tr.selected").length == 0) {
		return false;
	} else if ($("#dialog-sigEdit").hasClass("ui-dialog-content") && $("#dialog-sigEdit").dialog("isOpen")) {
		$("#dialog-sigEdit").parent().effect("shake", 300);
		return false;
	}
		
	openDeleteDialog({
		signatures: $.map($("#sigTable tr.selected"), function(n) {
			return tripwire.client.signatures[$(n).data("id")];
		})
	});
});

function openDeleteDialog(vm, successFunction) {
	openDeleteDialog.deleteDialogVM = vm;	// outside so it's not saved in the closure first time we open the dialog

	// check if dialog is open
	if (!$("#dialog-deleteSig").hasClass("ui-dialog-content")) {
		$("#dialog-deleteSig").dialog({
			resizable: false,
			minHeight: 0,
			width: 420,
			dialogClass: "dialog-noeffect ui-dialog-shadow",
			buttons: {
				Delete: function() {
					// One submit at a time: the button comes back in `always`.
					$("#dialog-deleteSig").parent().find(":button:contains('Delete')").button("disable");
					var payload = {"signatures": {"remove": []}, "systemID": viewingSystemID};
					var undo = [];

					var signaturePayload = $.map(openDeleteDialog.deleteDialogVM.signatures, function(signature) {
						if (signature.type != "wormhole") {
							undo.push(signature);
							return signature.id;
						} else {
							var wormhole = $.map(tripwire.client.wormholes, function(wormhole) { if (wormhole.initialID == signature.id || wormhole.secondaryID == signature.id) return wormhole; })[0];
							undo.push({"wormhole": wormhole, "signatures": [tripwire.client.signatures[wormhole.initialID], tripwire.client.signatures[wormhole.secondaryID]]});
							return wormhole;
						}
					});
					payload.signatures.remove = signaturePayload;

					var success = function(data) {
						if (data.resultSet && data.resultSet[0].result == true) {
							$("#dialog-deleteSig").dialog("close");
							if(successFunction) { successFunction(); }

							$("#undo").removeClass("disabled");
							if (viewingSystemID in tripwire.signatures.undo) {
								tripwire.signatures.undo[viewingSystemID].push({action: "remove", signatures: undo});
							} else {
								tripwire.signatures.undo[viewingSystemID] = [{action: "remove", signatures: undo}];
							}

							sessionStorage.setItem("tripwire_undo", JSON.stringify(tripwire.signatures.undo));
						}
					}

					var always = function(data) {
						$("#dialog-deleteSig").parent().find(":button:contains('Delete')").button("enable");
					}

					tripwire.refresh('refresh', payload, success, always);
				},
				Cancel: function() {
					$(this).dialog("close");
				}
			},
			open: function() {
				// The dialog's own language: a title that says what, a lead that
				// says where, a list only when there is more than one, a note only
				// when a wormhole is among them, and the safe action focused.
				const sigs = openDeleteDialog.deleteDialogVM.signatures;
				const one = sigs.length == 1;
				const idOf = (s) => s.signatureID ? formatSignatureID(s.signatureID) : "";
				$("#dialog-deleteSig").dialog("option", "title", one ? "Delete signature" : "Delete " + sigs.length + " signatures");

				const $lead = $("#deleteSigLead").empty();
				if (one) {
					$lead.append(sigs[0].signatureID ? $("<span class='confirm-sig'></span>").text(idOf(sigs[0])) : $("<span class='confirm-unidentified'></span>").text("An unidentified " + sigs[0].type + " signature"));
				} else {
					$lead.append(document.createTextNode(sigs.length + " signatures"));
				}
				$lead.append(document.createTextNode(" will be removed from "))
					.append(systemRendering.renderSystem(systemAnalysis.analyse(sigs[0].systemID)))
					.append(document.createTextNode("."));

				const $list = $("#deleteSigList").empty();
				if (!one) {
					sigs.forEach(function(s) {
						$("<li></li>")
							.append(s.signatureID ? $("<span class='confirm-sig'></span>").text(idOf(s)) : $("<span class='confirm-unidentified'></span>").text("unidentified"))
							.append($("<span class='confirm-type'></span>").text(s.type || ""))
							.appendTo($list);
					});
				}
				const wormholes = sigs.filter(function(s) { return s.type == "wormhole"; }).length;
				$("#deleteSigNote").text(wormholes ? (wormholes == 1 && one ? "Its connection and the signature on the other side go with it." : "A wormhole's connection and the signature on the other side go with it.") : "");

				$("#dialog-deleteSig").parent().find(".ui-dialog-buttonpane button.is-quiet, .ui-dialog-buttonpane button:contains('Cancel')").first().focus();
			},
			close: function() {
				$("#sigTable tr.selected").removeClass("selected");
				//$("#sigTable .sigDelete").removeClass("invisible");
			}
		});		
	} else if (!$("#dialog-deleteSig").dialog("isOpen")) {
		$("#dialog-deleteSig").dialog("open");
	}
}
