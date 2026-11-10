// Spoken jump announcements. The browser's speech is replaced with a
// recorder so the test reads what would have been said; zKillboard, ESI
// names, EVE-Scout and ElevenLabs are answered by fixtures, so nothing
// here depends on live kills or spends ElevenLabs credit.
const path = require("path");
const fs = require("fs");
const { test } = require("@playwright/test");
const { login, expect } = require("./helpers");

const MP3 = fs.readFileSync(path.join(__dirname, "fixtures", "silence.mp3"));
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };

async function recordSpeech(page) {
	await page.addInitScript(() => {
		window.__spoken = [];
		const fake = {
			speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 5); },
			cancel() {}, resume() {}, speaking: false, addEventListener() {},
			getVoices() { return [{ voiceURI: "test", name: "Test Voice", lang: "en-GB" }]; }
		};
		Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
		if (!window.SpeechSynthesisUtterance) { window.SpeechSynthesisUtterance = function(text) { this.text = text; }; }
		try { localStorage.removeItem("tripwire.voice.studio"); } catch (e) {}
	});
}

// A J-space system with two statics, either on the map or not.
async function pickSystem(page, onMap) {
	return page.evaluate((onMap) => {
		const mapped = tripwire.voiceText.mappedSystems(tripwire.client.signatures, tripwire.client.wormholes);
		const ids = Object.keys(appData.systems).filter(id => {
			const s = appData.systems[id];
			return s.class === 2 && s.statics && s.statics.length === 2 && /^J[1-9]\d{5}$/.test(s.name) && !s.effect;
		});
		const id = onMap ? Object.keys(mapped).find(m => tripwire.voiceText.arrival(appData.systems[m])) : ids.find(i => !mapped[i]);
		return id ? { id: Number(id), name: appData.systems[id].name } : null;
	}, onMap);
}

async function jump(page, toID, toName) {
	await page.evaluate(([toID, toName]) => {
		$("#toggle-automapper").removeClass("active");   // a test jump must never map anything
		options.buttons.follow = false;
		tripwire.client.EVE = Object.assign({}, tripwire.client.EVE, { systemID: 30000142, systemChange: false });
		tripwire.EVE({ characterID: 1, characterName: "Probe", systemID: toID, systemName: toName });
	}, [toID, toName]);
}

test.describe("voice announcements", () => {
	// The PWA service worker would carry these requests past page.route, to
	// the real zKillboard and ElevenLabs.
	test.use({ serviceWorkers: "block" });

	test.beforeEach(async ({ page }) => {
		await recordSpeech(page);
		await login(page, "Perimeter");
		await page.mouse.click(5, 5);   // a real interaction: browsers hold speech until there is one
	});
	test.afterEach(async ({ page }) => {
		// Back to the defaults, saved, so the account is left as it was found.
		await page.evaluate(async () => {
			options.voice = JSON.parse(JSON.stringify(options.reset.defaults.voice));
			tripwire.jumpVoice.paint();
			try { localStorage.removeItem("tripwire.voice.studio"); } catch (e) {}
			await options.save();   // finished before the next test loads the account
		}).catch(() => {});
	});

	test("Settings: choices are saved with the account, the ElevenLabs key stays in this browser", async ({ page }) => {
		const posted = [];
		page.on("request", r => { if (/options\.php/.test(r.url()) && r.method() === "POST") { posted.push(decodeURIComponent(r.postData() || "")); } });
		await page.click("#settings");
		await page.click("#optionsAccordion [role=tab][data-tab=voice]");
		await expect(page.locator("[data-pane=voice]")).toBeVisible();
		const onSwitch = page.locator("label.switch:has(#voice-enabled) .switch-track");
		await onSwitch.scrollIntoViewIfNeeded();
		await onSwitch.click();
		await expect(page.locator("#voice-enabled")).toBeChecked();
		await page.locator("[data-voice-part=who]").uncheck();
		await page.selectOption("#voice-engine", "elevenlabs");
		await expect(page.locator("#voice-eleven-key")).toBeVisible();
		await expect(page.locator("#voice-choice")).toBeHidden();
		await page.fill("#voice-eleven-key", "sk_test_e2e_key");
		await page.locator(".ui-dialog:visible").getByRole("button", { name: "Save" }).click();

		await expect.poll(() => posted.length).toBeGreaterThan(0);
		const saved = posted[posted.length - 1];
		expect(saved).toMatch(/"voice":\{"enabled":true/);
		expect(saved).toMatch(/"who":false/);
		expect(saved).not.toContain("sk_test_e2e_key");
		const studio = await page.evaluate(() => JSON.parse(localStorage.getItem("tripwire.voice.studio")));
		expect(studio).toMatchObject({ engine: "elevenlabs", key: "sk_test_e2e_key" });
		await expect(page.locator("#voice-toggle")).toHaveAttribute("aria-pressed", "true");

		// The header squelch, with its volume beside it while the voice is on.
		await expect(page.locator("#voice-toggle")).toHaveAttribute("aria-label", /^Squelch: voice on/);
		await expect(page.locator("#voice-volume")).toBeVisible();
		await page.locator("#voice-volume").fill("0.3");
		expect(await page.evaluate(() => options.voice.volume)).toBe(0.3);
		await page.click("#voice-toggle");
		await expect(page.locator("#voice-toggle")).toHaveAttribute("aria-pressed", "false");
		await expect(page.locator("#voice-toggle")).toHaveAttribute("aria-label", "Squelched: voice off");
		await expect(page.locator("#voice-volume")).toBeHidden();
		expect(await page.evaluate(() => options.voice.enabled)).toBe(false);
	});

	test("a jump into a system new to the map is announced: class, digits, statics, kills, who, Thera", async ({ page }) => {
		const target = await pickSystem(page, false);
		expect(target).not.toBeNull();
		const now = Date.now();
		await page.route(new RegExp("zkillboard\\.com/api/kills/solarSystemID/" + target.id + "/pastSeconds/28800/"), route => route.fulfill({
			headers: CORS, contentType: "application/json", body: JSON.stringify([
				{ killmail_id: 1, killmail_time: new Date(now - 3 * 3600e3).toISOString(), victim: { ship_type_id: 17715 }, attackers: [{ character_id: 11, corporation_id: 98000001 }] },
				{ killmail_id: 2, killmail_time: new Date(now - 20 * 60e3).toISOString(), victim: { ship_type_id: 33470 }, attackers: [{ character_id: 12, corporation_id: 98000001 }] }
			])
		}));
		await page.route(/esi\.evetech\.net\/latest\/universe\/names/, route => route.request().method() === "OPTIONS"
			? route.fulfill({ status: 204, headers: CORS })
			: route.fulfill({ headers: CORS, contentType: "application/json", body: JSON.stringify([{ id: 98000001, name: "Test Corp", category: "corporation" }]) }));
		await page.route(/cached_third_party\.php\?key=eve-scout-signatures/, route => route.fulfill({
			contentType: "application/json", body: JSON.stringify([{ in_system_id: target.id, out_system_name: "Thera", in_signature: "ABC-123", remaining_hours: 9 }])
		}));
		await page.evaluate(() => { options.voice = Object.assign(JSON.parse(JSON.stringify(options.reset.defaults.voice)), { enabled: true, trigger: "new" }); });

		await jump(page, target.id, target.name);
		await expect.poll(() => page.evaluate(() => window.__spoken.length), { timeout: 15000 }).toBeGreaterThanOrEqual(3);
		const spoken = await page.evaluate(() => window.__spoken);
		const digits = target.name.slice(-3).split("").join(" ");
		expect(spoken[0]).toMatch(new RegExp("^Class 2\\. " + digits + "\\. Statics: [A-Z] \\d \\d \\d to [^,]+, [A-Z] \\d \\d \\d to .+\\.$"));
		// Always in this order, whichever source answers first.
		expect(spoken[1]).toBe("2 kills in the last 8 hours, latest a Stratios, 20 minutes ago. Mostly Test Corp, 2 pilots.");
		expect(spoken[2]).toBe("Thera connection here, signature A B C, 9 hours left.");
	});

	test("a system already on the map is not announced, unless every system is asked for", async ({ page }) => {
		const known = await pickSystem(page, true);
		test.skip(!known, "no wormhole system on this map");
		await page.route(/zkillboard\.com|cached_third_party\.php\?key=eve-scout/, route => route.fulfill({ headers: CORS, contentType: "application/json", body: "[]" }));
		await page.evaluate(() => { options.voice.enabled = true; options.voice.trigger = "new"; });
		await jump(page, known.id, known.name);
		await page.waitForTimeout(1500);
		expect(await page.evaluate(() => window.__spoken)).toEqual([]);

		await page.evaluate(() => { options.voice.trigger = "all"; });
		await jump(page, known.id, known.name);
		await expect.poll(() => page.evaluate(() => window.__spoken.length), { timeout: 10000 }).toBeGreaterThan(0);
	});

	test("a kill filed in the pilot's system is announced as it happens", async ({ page }) => {
		const target = await pickSystem(page, false);
		let calls = 0;
		await page.route(new RegExp("zkillboard\\.com/api/kills/solarSystemID/" + target.id + "/pastSeconds/3600/"), route => {
			calls++;
			const old = { killmail_id: 50, killmail_time: new Date().toISOString(), victim: { ship_type_id: 11377 }, zkb: { totalValue: 3e8 } };
			const fresh = { killmail_id: 51, killmail_time: new Date().toISOString(), victim: { ship_type_id: 17715 }, zkb: { totalValue: 251400000 } };
			route.fulfill({ headers: CORS, contentType: "application/json", body: JSON.stringify(calls === 1 ? [old] : [fresh, old]) });
		});
		await page.evaluate((id) => { options.voice.enabled = true; tripwire.jumpVoice.watch(id); }, target.id);
		await expect.poll(() => page.evaluate(() => tripwire.jumpVoice._live().seen)).toBe(1);   // the first look only learns
		expect(await page.evaluate(() => window.__spoken)).toEqual([]);
		await page.evaluate(() => tripwire.jumpVoice._pollLive());
		await expect.poll(() => page.evaluate(() => window.__spoken)).toEqual(["Kill in system: a Gila, 251 million."]);
	});

	test("ElevenLabs reads with the pilot's key, and the browser voice stands in when it fails", async ({ page }) => {
		const keys = [];
		let fail = false;
		await page.route(/api\.elevenlabs\.io/, route => {
			if (route.request().method() === "OPTIONS") { return route.fulfill({ status: 204, headers: CORS }); }
			keys.push(route.request().headers()["xi-api-key"]);
			return fail
				? route.fulfill({ status: 401, headers: CORS, contentType: "application/json", body: JSON.stringify({ detail: { status: "invalid_api_key" } }) })
				: route.fulfill({ headers: CORS, contentType: "audio/mpeg", body: MP3 });
		});
		await page.evaluate(() => tripwire.speech.saveStudio({ engine: "elevenlabs", key: "sk_test_e2e_key", voiceId: "JBFqnCBsd6RMkjVDRZzb" }));

		await page.evaluate(() => tripwire.speech.say("Class 2. 0 0 7.", { rate: 1.1, volume: 0.5 }));
		expect(keys).toEqual(["sk_test_e2e_key"]);
		expect(await page.evaluate(() => tripwire.speech.status().studio)).toBe("ok");
		expect(await page.evaluate(() => window.__spoken)).toEqual([]);   // ElevenLabs read it, not the browser

		// The same line again is served from the cache: no second request.
		await page.evaluate(() => tripwire.speech.say("Class 2. 0 0 7.", { rate: 1.1, volume: 0.5 }));
		expect(keys.length).toBe(1);

		fail = true;
		await page.evaluate(() => tripwire.speech.say("Class 3. 1 2 3.", { rate: 1.1 }));
		expect(await page.evaluate(() => tripwire.speech.status().studio)).toBe("bad-key");
		expect(await page.evaluate(() => window.__spoken)).toEqual(["Class 3. 1 2 3."]);
	});
});
