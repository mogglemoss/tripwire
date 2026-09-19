function findSystemID(systemName) {
	for(let k in appData.systems) {
		if(appData.systems[k].name.toUpperCase() === systemName.toUpperCase()) return k; 
	}
	return undefined;
}

var viewingSystem = $("meta[name=system]").attr("content");
var viewingSystemID = findSystemID(viewingSystem);
var server = $("meta[name=server]").attr("content");
var app_name = $("meta[name=app_name]").attr("content");
var version = $("meta[name=version]").attr("content");

// A blank system is a fresh entry (no ?system= on the URL). It used to
// reload straight to Jita, and stay there. Now the first sync bootstraps
// on Jita without a reload, and the tracked pilot's location replaces it
// as soon as the first one arrives -- unless the user has already gone
// somewhere else. An explicit but invalid system still reloads to Jita.
var defaultToTrackedSystem = !viewingSystem;
var defaultSystemID = null;
if (defaultToTrackedSystem) {
	viewingSystem = "Jita";
	viewingSystemID = findSystemID(viewingSystem);
	defaultSystemID = viewingSystemID;
} else if (!viewingSystemID) {
	window.stop();
	window.location = '?system=Jita';
}

// Use this to test performance of javascript code lines
// var startTime = window.performance.now();
// console.log("stint: "+ (window.performance.now() - startTime));

if(init.masks) {
	setTimeout(() => {
		tripwire.masks = init.masks;
		maskRendering.update(tripwire.masks);
	}, 0);	// so maskRendering exists when it gets called
}
