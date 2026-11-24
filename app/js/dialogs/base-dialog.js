// Dialog effects
$("#wrapper").addClass("transition");

$(document).on("dialogopen", ".ui-dialog", function (event, ui) {
	// The tooltip of whatever the pointer is on closes when the pointer leaves
	// it. A dialog that opens beside the pointer, or from the keyboard, gives
	// it no reason to leave, and the tooltip sits over the dialog's fields.
	// (Not ValidationTooltips: those belong to the dialog.)
	[Tooltips, SystemActivityToolTips, WormholeRouteToolTips, WormholeTypeToolTips, OccupiedToolTips].forEach(function(t) { t.close({ignoreDelay: true}); });

	// Add additional full screen overlay for 2nd level dialog
	if ($(".ui-dialog:visible").length == 2 && $(this).hasClass("dialog-modal"))
		$("body").append($("<div id='overlay' class='overlay' />").css("z-index", $(this).css("z-index") - 1));
	else if ($("#overlay"))
		$("#overlay").css("z-index", $(this).css("z-index") - 1);

	if (!$(this).hasClass("dialog-noeffect"))
		$("#wrapper").addClass("blur");
});

$(document).on("dialogclose", ".ui-dialog", function (event, ui) {
	if (!$(".ui-dialog").is(":visible"))
		$("#wrapper").removeClass("blur");

	if ($(".ui-dialog:visible").length == 1)
		$("#overlay").remove();
	else if ($("#overlay"))
		$("#overlay").css("z-index", $(this).css("z-index") - 2);

	//if ($(".ui-dialog:visible").length == 0 && options.buttons.follow && viewingSystemID != tripwire.client.EVE.systemID)
	//	window.location = "?system="+tripwire.client.EVE.systemName;
});

