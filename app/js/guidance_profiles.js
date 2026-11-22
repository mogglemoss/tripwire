var guidance_profiles = (function() {
	var blueLoot = null;
	return {
		// Systems with an NPC buyer for blue loot, as the gate map numbers
		// them (the id less 30000000). From the same generated list as the
		// Routes panel's "nearest blue loot" (route-presets.js).
		get blueLootSystems() {
			if (!blueLoot) { blueLoot = Object.keys(routePresets.sets.blue).map(function(id) { return id - 30000000; }); }
			return blueLoot;
		},
		chainExits: []
	};
})();
