const assert = require('assert');
const { include } = require('./helpers/helpers');

global.tripwire = global.tripwire || {};
include('public/js/combine');
include('app/js/tripwire/genericSystemTypes');
include('app/js/tripwire/bookmarks');

const B = tripwire.bookmarks;
const C = (over) => B.compile(B.convention(over || {}, null));
// A server's words: WINGSPAN's, over the default.
const WDS = { name: "WDS", life: { "critical": ["<4H", "EOL"] }, mass: { "critical": ["<10%", "CRIT"] }, unknownSystem: ["???"] };
// A corp with many words of its own: Squizz's, where this importer started.
const SQUIZZ = {
	destinations: { "Drifter": ["DR"], "Triglavian": ["TR", "PC"], "wormhole": ["C?"] },
	factions: { "Caldari": ["SQUID"], "Minmatar": ["RUST"], "Gallente": ["FRANCE"], "Amarr": ["CHINA"] },
	life: { "critical": ["<4H"], "<1h": ["<1H"] },
	sites: { "Gas": ["GS"], "Data": ["DC"], "Relic": ["RC"], "auto": ["Z"] },
	unknownSignature: ["???"], unknownSystem: ["???"], camps: ["---", "-*-"]
};

describe('Bookmarks: what EVE and Tripwire name, with no corp words', function() {
	const c = C();
	it('reads a signature id, a wormhole type and Tripwire\'s own life and mass labels', function() {
		const b = B.parse("ABC-123 B274 EOL <10%\tWormholes\t2026.11.10 21:44", c);
		assert.deepEqual(b.id, ["ABC", "123"]);
		assert.equal(b.type, "Wormhole");
		assert.equal(b.destination, "High-Sec", "B274 leads to high-sec");
		assert.equal(b.life, "critical");
		assert.equal(b.mass, "critical");
	});
	it('reads words in any order, and Tripwire\'s class and security labels', function() {
		assert.equal(B.parse("HGX C2", c).destination, "Class-2");
		assert.equal(B.parse("C2 HGX", c).destination, "Class-2");
		assert.equal(B.parse("NS ABC <1h", c).life, "<1h");
		assert.equal(B.parse("ABC C247 <50%", c).mass, "destab");
	});
	it('names a system outright: Thera, or a system name among the words', function() {
		const idOf = (name) => Number(Object.keys(appData.systems).find(id => appData.systems[id].name === name));
		assert.equal(B.parse("ABC-123 Thera", c).system, idOf("Thera"));
		assert.equal(B.parse("ABC Fredagod LS", c).system, idOf("Fredagod"));
	});
	it('a full id and a site name is that site; a full id and anything else names the signature', function() {
		const site = B.parse("ZYP-952 Rampant Drone Fabricator", c);
		assert.deepEqual([site.type, site.name], ["Combat", "Rampant Drone Fabricator"]);
		const chain = B.parse("ABC-123 A31", c);
		assert.deepEqual([chain.type, chain.name], ["Unknown", "A31"], "a chain name rides along as the name");
	});
	it('leaves alone what names no signature: a bare chain name, plain text', function() {
		assert.equal(B.parse("A31\tChain\t2026.11.10 21:44", c), null);
		assert.equal(B.parse("A31 C2", c), null);
		assert.equal(B.parse("The Line", c), null);
		assert.equal(B.parse("ABC-123", c), null, "an id alone says nothing");
		assert.equal(B.parse("", c), null);
	});
	it('a run of ? is a signature not yet scanned, when the rest says hole', function() {
		const b = B.parse("??? C3 EOL", c);
		assert.deepEqual(b.id, ["???", ""]);
		assert.equal(b.destination, "Class-3");
		assert.equal(B.parse("???", c), null);
	});
	it('reads an escaped less-than from the clipboard, and ignores the home marker', function() {
		assert.equal(B.parse("C2 HGX &lt;10%", c).mass, "critical");
		assert.equal(B.parse("C3 ABC 658*", c).hint, "658");
	});
	it('does not know a corp\'s words, and does not take them for a place', function() {
		assert.equal(B.parse("C2 ABC <4H", c).life, undefined);
		assert.equal(B.parse("C3 SHX 658 <4H", c).hint, "658");
		assert.equal(B.parse("GS KSY Sizeable Perimeter Reservoir", c), null);
	});
});

describe('Bookmarks: a server\'s words and a pilot\'s own', function() {
	it('takes the server\'s words: WDS reads <4H, EOL and CRIT, and ??? for an unknown system', function() {
		const b = B.parse("C2 ABC ??? <4H CRIT", C(WDS));
		assert.equal(b.life, "critical");
		assert.equal(b.mass, "critical");
		assert.equal(b.hint, undefined);
	});
	it('reads a corp with many words of its own: sites, factions, camps', function() {
		const c = C(SQUIZZ);
		const gas = B.parse("GS KSY Sizeable Perimeter Reservoir", c);
		assert.deepEqual([gas.type, gas.name], ["Gas", "Sizeable Perimeter Reservoir"]);
		assert.equal(B.parse("GS KSY ---", c).name, undefined, "a camp marker is not a name");
		assert.equal(B.parse("Z LGD-429 Unsecured Perimeter Transponder Farm", c).type, "Data");
		assert.equal(B.parse("DR GCG ???", c).destination, "Drifter");
		assert.equal(B.parse("HS RVH RUST FREDAGOD", c).destination, "High-Sec");
	});
	it('replaces a meaning\'s words rather than adding to them', function() {
		assert.deepEqual(B.convention({ life: { critical: ["DOOM"] } }, null).life.critical, ["DOOM"]);
		assert.equal(B.parse("C2 ABC EOL", C({ life: { critical: ["DOOM"] } })).life, undefined);
	});
	it('uses the pilot\'s own words only when they ask for it', function() {
		const pilot = { own: true, convention: { destinations: { "High-Sec": ["H"] } } };
		assert.equal(B.parse("H ABC", B.compile(B.convention(WDS, pilot))).destination, "High-Sec");
		assert.equal(B.parse("H ABC", B.compile(B.convention(WDS, { own: false, convention: pilot.convention }))), null);
	});
	it('turns a convention into word -> meaning rows for Settings, and back', function() {
		const rows = B.toRows(B.convention(WDS, null));
		assert.ok(rows.some(r => r.word === "CRIT" && r.meaning === "mass.critical"));
		assert.ok(rows.some(r => r.word === "HS" && r.meaning === "destinations.High-Sec"));
		const back = B.fromRows(rows.concat([{ word: "squid", meaning: "factions.Caldari" }, { word: "", meaning: "life.critical" }]));
		assert.deepEqual(back.mass.critical, ["<10%", "CRIT"]);
		assert.deepEqual(back.factions.Caldari, ["SQUID"]);
		assert.equal(B.toRows(B.merge(B.DEFAULT, back)).length, rows.length + 1);
	});
});

describe('Bookmarks: where a connection goes', function() {
	const c = C(SQUIZZ), systems = appData.systems, regions = appData.regions, generic = appData.genericSystemTypes;
	it('names the system when the hint points at one', function() {
		const id = B.resolve(B.parse("HS RVH RUST FREDAGOD", c), c, systems, regions);
		assert.equal(systems[id].name.toUpperCase().indexOf("FREDAGOD"), 0);
	});
	it('falls back to the kind of system when the hint does not', function() {
		const b = B.parse("C3 SHX ???", c);
		assert.equal(B.resolve(b, c, systems, regions), null);
		assert.equal(generic[B.farSide(b, c, systems, regions, generic)], "Class-3");
	});
	it('checks a J-number suffix and a faction word against a system', function() {
		const j = Object.keys(systems).find(id => systems[id].class === 3 && /^J\d{6}$/.test(systems[id].name));
		assert.ok(B.fits(B.parse("C3 ABC " + systems[j].name.slice(-3), c), systems[j], c, systems, regions));
		assert.equal(B.hintsFit("SQUID", systems[30000144], c, systems, regions, false), true, "Perimeter is Caldari space");
		assert.equal(B.hintsFit("RUST", systems[30000144], c, systems, regions, false), false);
	});
	it('describes a bookmark in plain words', function() {
		const d = C();
		assert.equal(B.describe(B.parse("C2 HGX ??? EOL <10%", d), d, systems, regions, generic), "Wormhole, signature HGX, to class 2, end of life, mass under 10%");
		assert.equal(B.describe(B.parse("ABC-123 A31", d), d), "Signature, ABC-123, named “A31”");
		assert.equal(B.describe(null, d), "Nothing here names a signature, so it is left alone.");
	});
});
