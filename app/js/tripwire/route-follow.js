// Following one route in EVE. The autopilot can be given gates but not
// wormholes, so a route with holes in it goes to EVE a stretch at a time: the
// gates up to the next hole, then, once the pilot is through, the gates after
// it. One route at a time, for one pilot, in this tab; nothing is saved.
//
//   start(what)   what = {to, route, character, mask, station, ...}; anything
//                 else on it is the caller's own
//   step()        look at where the pilot is and do what is due; called on
//                 every location report and on the panel's tick
//   stop(why)
//
// What it is given (env): at(), character(), mask() as they are now;
// waiting(follow), true while the map cannot be trusted; onward(follow, at),
// the route to fly on with; send(ids, character, wanted) -> Promise of
// {sent, of, error}; changed(); ended(follow, why).
tripwire.routeFollow = function(env) {
	"use strict";
	var f = null;

	// The systems EVE is to be given now, ending at the station if there is one.
	function waypoints(route, station) {
		var ids = tripwire.route.stretch(route);
		if (station && (!route.jumps || ids.length === route.jumps)) { ids = ids.slice(0, -1).concat(station); }
		return ids;
	}
	// Is `part` the end of `whole`? Then EVE has it already: gates behind the
	// pilot drop off the front as they are flown.
	function isTail(part, whole) {
		return part.length <= whole.length && part.every(function(id, i) { return id === whole[whole.length - part.length + i]; });
	}

	function send(ids) {
		var mine = f;
		f.sent = ids; f.state = "sending"; f.error = null;
		f.sending = (f.sending || 0) + 1;
		var turn = f.sending;
		// Stopped, or overtaken by a newer stretch: say no more to EVE.
		var wanted = function() { return f === mine && mine.sending === turn; };
		env.changed();
		return env.send(ids, f.character, wanted).then(function(result) {
			if (!wanted()) { return; }
			f.error = result.error ? result : null;
			f.state = f.error ? "error" : "gates";
			env.changed();
		});
	}

	function set(state) { if (f.state !== state) { f.state = state; env.changed(); } }

	function step() {
		if (!f) { return; }
		if (String(env.character()) !== String(f.character)) { return stop("you are tracking another pilot"); }
		if (String(env.mask()) !== String(f.mask)) { return stop("the mask changed"); }
		var at = env.at();
		if (!at) { return; }
		if (at === f.to) { return stop(null); }
		if (env.waiting(f)) { return; }
		// Off the route: the pilot has gone their own way, and EVE is left alone
		// until they are back on it.
		if (f.route.path.indexOf(at) < 0) {
			if (f.state === "sending") { f.sending++; f.sent = []; }      // the rest of it is not wanted now
			return set("off");
		}
		var next = env.onward(f, at);
		if (!next) { return set("stuck"); }
		var moved = next.path.join() !== f.route.path.join();
		f.route = next;
		var ids = waypoints(next, f.station);
		if (!ids.length) {
			var was = f.state;
			f.sent = []; f.sending = (f.sending || 0) + 1; f.state = "hole";
			if (moved || was !== "hole") { env.changed(); }
			return;
		}
		if (!isTail(ids, f.sent)) { return send(ids); }
		if (f.state !== "sending" && f.state !== "gates" && f.state !== "error") { f.state = f.error ? "error" : "gates"; moved = true; }
		if (moved) { env.changed(); }
	}

	function start(what) {
		f = what;
		f.sent = []; f.state = null; f.error = null;
		return step();
	}

	// why: a reason to show the pilot, "" when they pressed Stop and need none,
	// or null when the route is done.
	function stop(why) {
		if (!f) { return; }
		var was = f;
		f = null;
		env.ended(was, why);
		env.changed();
	}

	return {start: start, step: step, stop: stop, current: function() { return f; }, waypoints: waypoints};
};

// Give EVE a list of waypoints, in order, one at a time: the first replaces
// what is there, the rest are added after it. `post(id, first)` makes one
// call. Resolves with {sent, of, error}; a refusal stops it there.
tripwire.routeFollow.deliver = function(ids, post, wanted) {
	"use strict";
	var sent = 0;
	function next() {
		if (sent >= ids.length || !wanted()) { return {sent: sent, of: ids.length, error: null}; }
		return Promise.resolve(post(ids[sent], sent === 0)).then(function() { sent++; return next(); });
	}
	return Promise.resolve().then(next).catch(function(e) {
		return {sent: sent, of: ids.length, error: e && e.status ? "ESI " + e.status : (e && e.message) || "no answer from ESI"};
	});
};
