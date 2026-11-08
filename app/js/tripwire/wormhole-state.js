// Wormhole life and mass: the states, their labels and their colours, in one
// place for the parts of the UI that name them (the row, the dialog, the
// palette, the paste matching dialog).
//
// Life follows official Tripwire 2.0: three stored values, stable, critical
// (EOL) and <1h. The server sets the expiry when life changes. Mass keeps the
// client's wording: <50% and <10%.
tripwire.wormholeState = (function() {
	"use strict";

	var LIFE = [
		{value: "stable",   label: "Stable", cls: "stable"},
		{value: "critical", label: "EOL",    cls: "critical"},
		{value: "<1h",      label: "<1h",    cls: "eol-1h"}
	];
	var MASS = [
		{value: "stable",   label: "Stable", cls: "stable"},
		{value: "destab",   label: "<50%",   cls: "destab"},
		{value: "critical", label: "<10%",   cls: "critical"}
	];

	function byValue(list, value) {
		for (var i = 0; i < list.length; i++) { if (list[i].value === value) { return list[i]; } }
		return null;
	}

	function lifeState(wormhole) {
		return byValue(LIFE, wormhole && wormhole.life) || LIFE[0];
	}

	function massState(wormhole) {
		return byValue(MASS, wormhole && wormhole.mass) || MASS[0];
	}

	return {
		LIFE: LIFE, MASS: MASS,
		lifeState: lifeState, massState: massState,
		lifeChanges: function(value) { return {life: (byValue(LIFE, value) || LIFE[0]).value}; },
		presetFor: function(wormhole) { return lifeState(wormhole).value; }
	};
})();
