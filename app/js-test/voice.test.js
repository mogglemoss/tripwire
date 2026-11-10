const assert = require('assert');
const { include } = require('./helpers/helpers');

global.tripwire = global.tripwire || {};
include('app/js/tripwire/voice-text');
include('app/js/speech');

const TYPES = { B274: { leadsTo: 'High-Sec' }, D382: { leadsTo: 'Class-2' }, U210: { leadsTo: 'Low-Sec' }, X877: { leadsTo: ['Class-4', 'Class-5'] } };
const hull = (id) => ({ 33470: 'Stratios', 17715: 'Gila' })[id] || null;

describe('Voice: what is said on a jump', function() {
	const T = tripwire.voiceText;

	it('says the class and anything unusual about the system', function() {
		assert.equal(T.arrival({ name: 'J113923', class: 3 }), 'Class 3.');
		assert.equal(T.arrival({ name: 'J155416', class: 1, effect: 'Black Hole' }), 'Class 1, Black Hole.');
		assert.equal(T.arrival({ name: 'J015092', class: 1, effect: 'Black Hole' }), 'Class 1, shattered, Black Hole.', 'J0 systems are shattered');
		assert.equal(T.arrival({ name: 'J123456', class: 4, effect: 'Wolf-Rayet Star' }), 'Class 4, Wolf-Rayet.');
		assert.equal(T.arrival({ name: 'J012686', class: 6 }), 'Class 6, shattered.');
		assert.equal(T.arrival({ name: 'J055520', class: 14 }), 'Drifter space, Sentinel.');
		assert.equal(T.arrival({ name: 'Thera', class: 12 }), 'Thera.');
		assert.equal(T.arrival({ name: 'Jita' }), null);
	});
	it('spells the last three digits', function() {
		assert.equal(T.digits({ name: 'J123007' }), '0 0 7.');
		assert.equal(T.digits({ name: 'Thera' }), null);
	});
	it('names the statics and where they go', function() {
		assert.equal(T.statics({ statics: ['B274', 'D382'] }, TYPES), 'Statics: B 2 7 4 to high-sec, D 3 8 2 to class 2.');
		assert.equal(T.statics({ statics: ['U210'] }, TYPES), 'Static: U 2 1 0 to low-sec.');
		assert.equal(T.statics({ statics: ['X877'] }, TYPES), 'Static: X 8 7 7 to class 4 or 5.');
		assert.equal(T.statics({ statics: [] }, TYPES), null);
	});
	it('counts recent kills and names the latest', function() {
		const now = Date.parse('2026-11-10T12:00:00Z');
		const list = [
			{ killmail_time: '2026-11-10T09:00:00Z', victim: { ship_type_id: 17715 } },
			{ killmail_time: '2026-11-10T11:40:00Z', victim: { ship_type_id: 33470 } }
		];
		assert.equal(T.kills(list, 8, now, hull), '2 kills in the last 8 hours, latest a Stratios, 20 minutes ago.');
		assert.equal(T.kills([], 8, now, hull), 'No kills in the last 8 hours.');
		assert.equal(T.kills(null, 8, now, hull), null);
	});
	it('names who has been killing only when it is a group', function() {
		const by = (corp, pilot) => ({ attackers: [{ corporation_id: corp, character_id: pilot }] });
		const counts = T.whoCounts([by(1, 10), by(1, 11), by(2, 20)]);
		assert.deepEqual(counts, { corporationID: 1, kills: 2, pilots: 3 });
		assert.equal(T.who(counts, 'Hard Knocks Citizens'), 'Mostly Hard Knocks Citizens, 3 pilots.');
		assert.equal(T.whoCounts([by(1, 10)]), null, 'one kill is not a pattern');
		assert.equal(T.whoCounts([by(1, 10), by(2, 20)]), null, 'no corp on two kills');
		assert.equal(T.whoCounts([{ attackers: [{ corporation_id: 1000125 }] }, { attackers: [{ corporation_id: 1000125 }] }]), null, 'NPCs are not anyone');
	});
	it('says a Thera or Turnur connection in this system', function() {
		const links = [
			{ in_system_id: 31001053, out_system_name: 'Thera', in_signature: 'ABC-123', remaining_hours: 9.4 },
			{ in_system_id: 31001053, out_system_name: 'Somewhere', in_signature: 'XYZ-999', remaining_hours: 3 },
			{ in_system_id: 1, out_system_name: 'Turnur', in_signature: 'QQQ-111', remaining_hours: 2 }
		];
		assert.equal(T.hubLinks(links, 31001053), 'Thera connection here, signature A B C, 9 hours left.');
		assert.equal(T.hubLinks(links, 2), null);
	});
	it('says a live kill with a round value', function() {
		assert.equal(T.liveKill({ victim: { ship_type_id: 17715 }, zkb: { totalValue: 251400000 } }, hull), 'Kill in system: a Gila, 251 million.');
		assert.equal(T.liveKill({ victim: { ship_type_id: 1 }, zkb: { totalValue: 1240000000 } }, hull), 'Kill in system: a ship, 1.2 billion.');
	});
	it('has a brief form of every line: what you need, then quiet', function() {
		const now = Date.parse('2026-11-10T12:00:00Z');
		const list = [{ killmail_time: '2026-11-10T11:40:00Z', victim: { ship_type_id: 33470 } }, { killmail_time: '2026-11-10T09:00:00Z', victim: {} }];
		assert.equal(T.statics({ statics: ['B274', 'D382'] }, TYPES, true), 'Statics high-sec, class 2.');
		assert.equal(T.statics({ statics: ['U210'] }, TYPES, true), 'Static low-sec.');
		assert.equal(T.kills(list, 8, now, hull, true), '2 kills, latest 20 minutes ago.');
		assert.equal(T.kills([], 8, now, hull, true), 'No kills.');
		assert.equal(T.who({ pilots: 3 }, 'Hard Knocks Citizens', true), 'Mostly Hard Knocks Citizens.');
		assert.equal(T.hubLinks([{ in_system_id: 5, out_system_name: 'Turnur', in_signature: 'ABC-123', remaining_hours: 9 }], 5, true), 'Turnur here, signature A B C.');
		assert.equal(T.liveKill({ victim: { ship_type_id: 17715 }, zkb: { totalValue: 251400000 } }, hull, true), 'Kill: a Gila.');
	});
	it('knows which systems are already on the map', function() {
		const sigs = { 1: { systemID: 31000001 }, 2: { systemID: 31000002 } };
		const holes = { 9: { initialID: 1, secondaryID: 2 } };
		assert.deepEqual(Object.keys(T.mappedSystems(sigs, holes)).sort(), ['31000001', '31000002']);
		assert.deepEqual(T.mappedSystems(null, null), {});
	});
});

describe('Voice: the engine', function() {
	const S = tripwire.speech;
	const v = (voiceURI, name, lang) => ({ voiceURI, name, lang });

	it('names a voice by URI, name, language and which duplicate it is', function() {
		const a = v('android', 'English', 'en-US'), b = v('android', 'English', 'en-US'), c = v('x', 'Daniel', 'en-GB');
		const all = [a, b, c];
		assert.equal(S.pickVoice(S.voiceKey(b, all), all), b);
		assert.equal(S.pickVoice(S.voiceKey(a, all), all), a);
	});
	it('falls back to British English, then any English', function() {
		const us = v('u', 'Alex', 'en-US'), gb = v('g', 'Daniel', 'en-GB'), fr = v('f', 'Thomas', 'fr-FR');
		assert.equal(S.pickVoice('', [fr, us, gb]), gb);
		assert.equal(S.pickVoice('missing||nobody||xx||0', [fr, us]), us);
	});
	it('builds the ElevenLabs request with the key in a header only', function() {
		const r = S.requestFor('Class 2.', { key: 'sk_test', voiceId: 'JBF', model: 'eleven_flash_v2_5', speed: 1.1 });
		assert.equal(r.url, 'https://api.elevenlabs.io/v1/text-to-speech/JBF?output_format=mp3_44100_64');
		assert.equal(r.headers['xi-api-key'], 'sk_test');
		assert.ok(!/sk_test/.test(r.url + r.body), 'the key is not in the URL or body');
		assert.equal(JSON.parse(r.body).voice_settings.speed, 1.1);
	});
	it('clamps speed to what ElevenLabs accepts', function() {
		assert.equal(S.speedFor(1.6), 1.2);
		assert.equal(S.speedFor(0.5), 0.7);
		assert.equal(S.speedFor(1.05), 1.05);
	});
	it('reads ElevenLabs failures', function() {
		assert.equal(S.classify(401), 'bad-key');
		assert.equal(S.classify(402), 'quota');
		assert.equal(S.classify(429), 'rate-limited');
		assert.equal(S.classify(400, { detail: { status: 'quota_exceeded' } }), 'quota');
		assert.equal(S.classify(500), 'other');
	});
});
