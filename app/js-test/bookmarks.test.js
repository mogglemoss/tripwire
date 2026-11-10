const assert = require('assert');
const { include } = require('./helpers/helpers');

global.tripwire = global.tripwire || {};
include('public/js/combine');
include('app/js/tripwire/genericSystemTypes');
include('app/js/tripwire/bookmarks');

const B = tripwire.bookmarks;
const C = (over) => B.compile(B.convention(over || {}, null));
const WDS = { name: "WDS", life: { "critical": ["<4H", "EOL"] }, mass: { "critical": ["<10%", "CRIT"] } };

describe('Bookmarks: reading titles with the default convention', function() {
	const c = C();
	it('reads a wormhole: destination, signature, hint, life, mass', function() {
		const b = B.parse("C2 HGX ??? <4H <10%\tMC Deputy Training / Wormholes\t2026.11.10 21:44", c);
		assert.deepEqual(b.id, ["HGX", ""]);
		assert.equal(b.type, "Wormhole");
		assert.equal(b.destination, "Class-2");
		assert.equal(b.hint, undefined, "??? is no hint");
		assert.equal(b.life, "critical");
		assert.equal(b.mass, "critical");
	});
	it('keeps a destination hint, and a full id with or without its hyphen', function() {
		assert.equal(B.parse("C3 SHX 658", c).hint, "658");
		assert.deepEqual(B.parse("HS NHF-123 FRANCE", c).id, ["NHF", "123"]);
		assert.deepEqual(B.parse("HS NHF123 FRANCE", c).id, ["NHF", "123"]);
		assert.equal(B.parse("HS RVH RUST FREDAGOD", c).hint, "RUST FREDAGOD");
	});
	it('reads <1h as under an hour, the stricter of two life markers, and ignores the home marker', function() {
		assert.equal(B.parse("LS ABC <1H", c).life, "<1h");
		assert.equal(B.parse("LS ABC <4H <1H", c).life, "<1h");
		const home = B.parse("C3 ??? 658 *", c);
		assert.deepEqual(home.id, ["???", ""]);
		assert.equal(home.hint, "658");
		assert.equal(B.parse("C3 ABC 658*", c).hint, "658");
	});
	it('reads an escaped less-than from the clipboard', function() {
		assert.equal(B.parse("C2 HGX &lt;4H", c).life, "critical");
	});
	it('reads class codes beyond the list, Drifter and Pochven', function() {
		assert.equal(B.parse("C15 ABC", c).destination, "Class-15");
		assert.equal(B.parse("DR GCG ???", c).destination, "Drifter");
		assert.equal(B.parse("PC ABC", c).destination, "Triglavian");
		assert.equal(B.parse("C? ABC", c).destination, "wormhole");
	});
	it('reads sites: coded, named, bare, and camps', function() {
		assert.deepEqual([B.parse("GS KSY Sizeable Perimeter Reservoir", c).type, B.parse("GS KSY Sizeable Perimeter Reservoir", c).name], ["Gas", "Sizeable Perimeter Reservoir"]);
		assert.equal(B.parse("GS KSY ---", c).name, undefined, "a camp marker is not a name");
		assert.equal(B.parse("RC ABC -*-", c).name, undefined);
		assert.equal(B.parse("Z LGD-429 Unsecured Perimeter Transponder Farm", c).type, "Data");
		assert.equal(B.parse("ZYP-952 Rampant Drone Fabricator", c).type, "Combat");
		assert.equal(B.parse("Z ABC Local staging", c).type, "Unknown", "an unknown site stays Unknown, no new type");
	});
	it('leaves rows it does not read: scanner rows, plain text', function() {
		assert.equal(B.parse("ABC-123\tCosmic Signature\tWormhole\tUnstable Wormhole\t100,0%\t4,48 AU", c), null);
		assert.equal(B.parse("Hello world", c), null);
		assert.equal(B.parse("XX ABC", c), null);
		assert.equal(B.parse("", c), null);
	});
	it('leaves a chain name alone: "A31" says nothing a map can use', function() {
		assert.equal(B.parse("A31\tChain\t2026.11.10 21:44", c), null);
		assert.equal(B.parse("A31 C2", c), null);
	});
});

describe('Bookmarks: a server convention and a pilot\'s own', function() {
	it('takes the server\'s words: WDS reads EOL and CRIT', function() {
		const b = B.parse("C2 ABC ??? EOL CRIT", C(WDS));
		assert.equal(b.life, "critical");
		assert.equal(b.mass, "critical");
		assert.equal(b.hint, undefined);
		assert.equal(B.parse("C2 ABC <4H", C(WDS)).life, "critical", "the default words still read where WDS keeps them");
		assert.equal(B.parse("C2 ABC EOL", C()).hint, "EOL", "the default does not know EOL");
	});
	it('replaces a section\'s list rather than adding to it', function() {
		const conv = B.convention({ unknownSystem: ["---"] }, null);
		assert.deepEqual(conv.unknownSystem, ["---"]);
		assert.equal(B.parse("C2 ABC ???", B.compile(conv)).hint, undefined, "a run of ? still means unknown");
	});
	it('uses the pilot\'s own convention only when they ask for it', function() {
		const pilot = { own: true, convention: { destinations: { "High-Sec": ["H"] } } };
		assert.equal(B.parse("H ABC", B.compile(B.convention(WDS, pilot))).destination, "High-Sec");
		assert.equal(B.parse("H ABC", B.compile(B.convention(WDS, { own: false, convention: pilot.convention }))), null);
	});
});

describe('Bookmarks: where a connection goes', function() {
	const c = C(), systems = appData.systems, regions = appData.regions, generic = appData.genericSystemTypes;
	it('names the system when the hint points at one', function() {
		const b = B.parse("HS RVH RUST FREDAGOD", c);
		const id = B.resolve(b, c, systems, regions);
		assert.equal(systems[id].name.toUpperCase().indexOf("FREDAGOD"), 0);
	});
	it('falls back to the kind of system when the hint does not', function() {
		const b = B.parse("C3 SHX ???", c);
		assert.equal(B.resolve(b, c, systems, regions), null);
		assert.equal(generic[B.farSide(b, c, systems, regions, generic)], "Class-3");
	});
	it('checks a J-number suffix and a faction word against a system', function() {
		const j = Object.keys(systems).find(id => systems[id].class === 3 && /^J\d{6}$/.test(systems[id].name));
		const b = B.parse("C3 ABC " + systems[j].name.slice(-3), c);
		assert.ok(B.fits(b, systems[j], c, systems, regions));
		assert.equal(B.hintsFit("SQUID", systems[30000144], c, systems, regions, false), true, "Perimeter is Caldari space");
		assert.equal(B.hintsFit("RUST", systems[30000144], c, systems, regions, false), false);
	});
	it('describes a bookmark in plain words', function() {
		assert.equal(B.describe(B.parse("C2 HGX ??? <4H <10%", c), c, systems, regions, generic), "Wormhole, signature HGX, to class 2, end of life, mass under 10%");
		assert.equal(B.describe(null, c), "Not a bookmark this convention reads.");
	});
});
