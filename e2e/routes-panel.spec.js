// The Routes panel, in the real page: destinations, preferences, the hops,
// and the row it shares with the other panels. Routes are planned against
// the page's own map except where a test needs known holes; then the panel is
// handed a small chain (useSource), so nothing is written to the mask.
const { test } = require("@playwright/test");
const { login, expect } = require("./helpers");

// The account's route settings back to how a new account has them, saved.
async function resetRoutes(page) {
	await page.evaluate(async () => {
		options.routes = { from: "pilot", fromSystem: null, destinations: [], nearest: [], prefs: routeEngine.withDefaults(null) };
		if (options.panels) { delete options.panels.routesWidget; if (options.panels.layout) { options.panels.layout.columns = {}; } }
		try { localStorage.removeItem("tripwire.routes.prefsOpen"); } catch (e) {}
		tripwire.routesPanel.useSource(null);
		tripwire.panels.apply();
		await options.save();
	});
}

// Jita to Amarr through one J-space system: the first hole scanned and at
// end of life, the second one with no signature recorded.
async function useTwoHoles(page) {
	return page.evaluate(() => {
		const idOf = n => Number(Object.keys(appData.systems).find(k => appData.systems[k].name === n));
		const JITA = idOf("Jita"), AMARR = idOf("Amarr"), J = Number(Object.keys(appData.systems).find(k => appData.systems[k].class === 3));
		tripwire.routesPanel.useSource({
			signatures: { 1: { systemID: JITA, signatureID: "abc123" }, 2: { systemID: J, signatureID: "def456" }, 3: { systemID: J }, 4: { systemID: AMARR } },
			wormholes: { 10: { id: 10, initialID: 1, secondaryID: 2, type: "B274", life: "critical", mass: "stable" }, 11: { id: 11, initialID: 3, secondaryID: 4, type: null, life: "stable", mass: "stable" } },
			scoutLinks: []
		});
		return { JITA, AMARR, J, jName: appData.systems[J].name };
	});
}

const card = (page, name) => page.locator("#routes-list .route-card", { has: page.locator(".route-name", { hasText: new RegExp("^" + name + "$") }) });

test.describe("Routes panel", () => {
	test.use({ serviceWorkers: "block" });
	test.beforeEach(async ({ page }) => { await login(page, "Jita"); await resetRoutes(page); });
	test.afterEach(async ({ page }) => { await resetRoutes(page).catch(() => {}); });

	test("a destination is added by name, routed, kept with the account, and removed", async ({ page }) => {
		const saved = [];
		page.on("request", r => { if (/options\.php/.test(r.url()) && r.method() === "POST") { saved.push(decodeURIComponent(r.postData() || "")); } });
		await expect(page.locator("#routesWidget .panel-title")).toHaveText("Routes");
		await expect(page.locator("#routes-list .routes-empty")).toBeVisible();

		await page.fill("#routes-add", "Amar");
		await page.locator(".ui-autocomplete:visible li", { hasText: "Amarr" }).first().click();
		const amarr = card(page, "Amarr");
		await expect(amarr).toBeVisible();
		await expect(page.locator("#routes-add")).toHaveValue("");

		// The card says what the engine says, for the origin the panel names.
		const want = await page.evaluate(() => {
			const AMARR = Number(Object.keys(appData.systems).find(k => appData.systems[k].name === "Amarr"));
			const o = tripwire.routesPanel.origin();
			return { jumps: tripwire.route.plan(o.id, AMARR, options.routes.prefs).jumps, origin: appData.systems[o.id].name, AMARR };
		});
		await expect(amarr.locator(".route-jumps")).toHaveText(want.jumps + "j");
		await expect(amarr.locator(".route-hop")).toHaveCount(want.jumps + 1);
		await expect(page.locator("#routes-origin")).toContainText("From " + want.origin);
		await expect(page.locator("#routes-origin")).toContainText("shortest");

		await expect.poll(() => saved.some(s => s.includes('"destinations":[' + want.AMARR + ']'))).toBe(true);
		await page.reload();
		await page.waitForFunction(() => window.tripwire && tripwire.routesPanel && tripwire.timer, null, { timeout: 30000 });
		await expect(card(page, "Amarr")).toBeVisible();

		await card(page, "Amarr").locator(".route-remove").click();
		await expect(card(page, "Amarr")).toHaveCount(0);
		await expect.poll(() => saved.some(s => s.includes('"destinations":[]'))).toBe(true);
	});

	test("preferences change the route: a hole with no signature is marked, and can be left out", async ({ page }) => {
		const ids = await useTwoHoles(page);
		await page.evaluate((ids) => { options.routes.from = "system"; tripwire.routesPanel.addDestination(ids.AMARR); }, ids);   // viewing Jita
		const amarr = card(page, "Amarr");
		await expect(amarr.locator(".route-jumps")).toHaveText("2j");
		await expect(amarr.locator(".route-meta")).toHaveText("2 wormholes · 1 J-space · 1 no sig · 1 EOL");
		// Each in its state's colour, as the chain map has them: a caution, and a warning.
		await expect(amarr.locator(".route-warn")).toHaveText(["1 no sig", "1 EOL"]);
		await expect(amarr.locator(".route-warn.is-caution")).toHaveText("1 no sig");
		await expect(amarr.locator(".route-warn.is-critical")).toHaveText("1 EOL");
		await expect(amarr.locator(".route-link.is-wh.is-critical")).toHaveCount(1);
		await expect(amarr.locator(".route-link.is-wh")).toHaveCount(2);
		await expect(amarr.locator(".route-link.is-no-sig")).toHaveCount(1);
		await expect(amarr.locator(".route-hop").nth(1)).toHaveAttribute("data-tip", new RegExp("^" + ids.jName + " \\(C3\\) · wormhole ABC-123, B274, EOL$"));
		await expect(amarr.locator(".route-hop").nth(2)).toHaveAttribute("data-tip", /^Amarr \(HS \d\.\d\d\) · wormhole, no sig recorded$/);

		// The preferences are behind the cog.
		await expect(page.locator("#routes-prefs")).toBeHidden();
		await page.click("#routes-prefs-toggle");
		await expect(page.locator("#routes-prefs")).toBeVisible();
		const gates = await page.evaluate((ids) => tripwire.route.plan(ids.JITA, ids.AMARR, {}, { signatures: {}, wormholes: {}, scoutLinks: [] }).jumps, ids);

		const noSig = page.locator(".route-chip[data-pref=skipNoSig]");
		await expect(noSig).toHaveText("No sig");
		await noSig.click();
		await expect(noSig).toHaveAttribute("aria-pressed", "true");
		await expect(amarr.locator(".route-jumps")).toHaveText(gates + "j");
		await expect(amarr.locator(".route-warn")).toHaveCount(0);
		await expect(page.locator("#routes-origin")).toContainText("skipping no sig");
		await noSig.click();
		await expect(amarr.locator(".route-jumps")).toHaveText("2j");

		await page.locator(".route-chip[data-pref=skipEol]").click();
		await expect(amarr.locator(".route-jumps")).toHaveText(gates + "j");
		await page.locator(".route-chip[data-pref=skipEol]").click();

		// Safer: the J-space system costs more than the gates do.
		await page.selectOption("#routes-mode", "safer");
		await expect(page.locator("#routes-origin")).toContainText("safer");
		await expect(amarr.locator(".route-link.is-wh")).toHaveCount(0);
		expect(await page.evaluate(() => options.routes.prefs.mode)).toBe("safer");
		await page.selectOption("#routes-mode", "shortest");

		// A large hole (B274) is too small for an extra-large ship.
		await page.selectOption("#routes-ship", "xl");
		await expect(amarr.locator(".route-jumps")).toHaveText(gates + "j");
		await expect(page.locator("#routes-origin")).toContainText("extra-large or bigger holes");
	});

	test("routes can start from the pilot, the system being viewed, or one typed in", async ({ page }) => {
		const saved = [];
		page.on("request", r => { if (/options\.php/.test(r.url()) && r.method() === "POST") { saved.push(decodeURIComponent(r.postData() || "")); } });
		const ids = await page.evaluate(() => {
			const idOf = n => Number(Object.keys(appData.systems).find(k => appData.systems[k].name === n));
			tripwire.routesPanel.useSource({ signatures: {}, wormholes: {}, scoutLinks: [] });
			tripwire.routesPanel.addDestination(idOf("Amarr"));
			return { JITA: idOf("Jita"), AMARR: idOf("Amarr"), DODIXIE: idOf("Dodixie") };
		});
		const jumps = (from) => page.evaluate(([from, to]) => tripwire.route.plan(from, to, {}, { signatures: {}, wormholes: {}, scoutLinks: [] }).jumps, [from, ids.AMARR]);
		const amarr = card(page, "Amarr");
		await page.click("#routes-prefs-toggle");
		await expect(page.locator("#routes-from-pick")).toBeHidden();

		await page.click("label[for=routes-from-system]");                      // viewing Jita
		await expect(page.locator("#routes-origin")).toContainText("From Jita");
		await expect(amarr.locator(".route-jumps")).toHaveText(await jumps(ids.JITA) + "j");

		// Other: a field appears; until something is typed the viewed system stands in.
		await page.click("label[for=routes-from-manual]");
		await expect(page.locator("#routes-from-pick")).toBeFocused();
		await expect(page.locator("#routes-origin")).toContainText("From Jita (type a start system)");
		await page.fill("#routes-from-pick", "Dodix");
		await page.locator(".ui-autocomplete:visible li", { hasText: "Dodixie" }).first().click();
		await expect(page.locator("#routes-origin")).toContainText("From Dodixie");
		await expect(page.locator("#routes-from-pick")).toHaveValue("Dodixie");
		await expect(amarr.locator(".route-jumps")).toHaveText(await jumps(ids.DODIXIE) + "j");
		await expect(amarr.locator(".route-hop").first()).toHaveAttribute("data-system", String(ids.DODIXIE));
		await expect.poll(() => saved.some(s => s.includes('"from":"manual"') && s.includes('"fromSystem":' + ids.DODIXIE))).toBe(true);

		// It is kept: after a reload the routes still start in Dodixie.
		await page.reload();
		await page.waitForFunction(() => window.tripwire && tripwire.routesPanel && tripwire.timer, null, { timeout: 30000 });
		await expect(page.locator("#routes-origin")).toContainText("From Dodixie");

		// Typed by name and Enter works too, and the pilot can be chosen again.
		await expect(page.locator("#routes-prefs")).toBeVisible();              // open is remembered in this browser
		await page.fill("#routes-from-pick", "hek");
		await page.locator("#routes-from-pick").press("Enter");
		await expect(page.locator("#routes-origin")).toContainText("From Hek");
		await page.click("label[for=routes-from-pilot]");
		await expect(page.locator("#routes-from-pick")).toBeHidden();
		await expect(page.locator("#routes-origin")).toContainText(/\(your pilot\)|no tracked pilot/);
	});

	test("an avoided system is routed around, and can be let back in", async ({ page }) => {
		const info = await page.evaluate(() => {
			const idOf = n => Number(Object.keys(appData.systems).find(k => appData.systems[k].name === n));
			const JITA = idOf("Jita"), AMARR = idOf("Amarr");
			tripwire.routesPanel.useSource({ signatures: {}, wormholes: {}, scoutLinks: [] });
			options.routes.from = "system";
			tripwire.routesPanel.addDestination(AMARR);
			const r = tripwire.route.plan(JITA, AMARR, {}, { signatures: {}, wormholes: {}, scoutLinks: [] });
			const mid = r.path[Math.floor(r.path.length / 2)];
			return { jumps: r.jumps, mid, midName: appData.systems[mid].name };
		});
		const amarr = card(page, "Amarr");
		await expect(amarr.locator(".route-jumps")).toHaveText(info.jumps + "j");
		await expect(amarr.locator('.route-hop[data-system="' + info.mid + '"]')).toHaveCount(1);

		await page.click("#routes-prefs-toggle");
		await page.fill("#routes-avoid-add", info.midName);
		await page.locator("#routes-avoid-add").press("Enter");
		await expect(page.locator("#routes-avoid-list .route-avoided")).toHaveText(new RegExp("^" + info.midName));
		await expect(amarr.locator('.route-hop[data-system="' + info.mid + '"]')).toHaveCount(0);
		await expect(page.locator("#routes-origin")).toContainText("avoiding 1");

		await page.locator("#routes-avoid-list .route-unavoid").click();
		await expect(page.locator("#routes-avoid-list .route-avoided")).toHaveCount(0);
		await expect(amarr.locator('.route-hop[data-system="' + info.mid + '"]')).toHaveCount(1);
	});

	test("the palette routes to a system, a hop shows its system, and no route says so", async ({ page }) => {
		await page.evaluate(() => { tripwire.routesPanel.useSource({ signatures: {}, wormholes: {}, scoutLinks: [] }); options.routes.from = "system"; tripwire.routesPanel.refresh(true); });
		await page.locator("body").click({ position: { x: 5, y: 400 } });
		await page.keyboard.press("/");
		await page.fill("#cmd-input", "route to Dodix");
		await expect(page.locator("#cmd-list li", { hasText: "Route to Dodixie" })).toBeVisible();
		await page.locator("#cmd-list li", { hasText: "Route to Dodixie" }).click();
		const dodixie = card(page, "Dodixie");
		await expect(dodixie).toBeVisible();

		// No hole leads to J-space on this (empty) chain.
		await page.evaluate(() => tripwire.routesPanel.addDestination(Number(Object.keys(appData.systems).find(k => appData.systems[k].class === 3))));
		await expect(page.locator("#routes-list .route-none")).toHaveText("Nothing on the map connects.");

		// The second hop is the first system out of Jita; clicking it views it.
		const next = dodixie.locator(".route-hop").nth(1), id = Number(await next.getAttribute("data-system"));
		await next.click();
		await page.waitForFunction((id) => Number(viewingSystemID) === id, id, { timeout: 15000 });
		// "This system" is now that one, so the route is a jump shorter.
		const jumps = await page.evaluate((id) => tripwire.route.plan(id, Number(Object.keys(appData.systems).find(k => appData.systems[k].name === "Dodixie")), {}, { signatures: {}, wormholes: {}, scoutLinks: [] }).jumps, id);
		await expect(dodixie.locator(".route-jumps")).toHaveText(jumps + "j");
	});

	test("EVE-Scout's holes are used when asked for, and the panel says when they cannot be loaded", async ({ page }) => {
		const ids = await page.evaluate(() => {
			const idOf = n => Number(Object.keys(appData.systems).find(k => appData.systems[k].name === n));
			return { JITA: idOf("Jita"), AMARR: idOf("Amarr"), THERA: idOf("Thera") };
		});
		let fail = true;
		const link = (id, out) => ({ id: String(id), wh_exits_outward: true, wh_type: "Q063", max_ship_size: "large", remaining_hours: 10, out_system_id: ids.THERA, out_system_name: "Thera", out_signature: "THR-00" + id, in_system_id: out, in_signature: "ABC-00" + id });
		await page.route(/cached_third_party\.php\?key=eve-scout-signatures/, r => fail ? r.fulfill({ status: 500, body: "no" })
			: r.fulfill({ contentType: "application/json", body: JSON.stringify([link(1, ids.JITA), link(2, ids.AMARR)]) }));
		// No chain: only gates and, when asked, EVE-Scout (which the panel fetches itself).
		await page.evaluate((ids) => { tripwire.routesPanel.useSource(null); eveScout.links = []; options.routes.from = "manual"; options.routes.fromSystem = ids.JITA; tripwire.routesPanel.addDestination(ids.AMARR); }, ids);
		const amarr = card(page, "Amarr");
		await expect(amarr.locator(".route-link.is-scout")).toHaveCount(0);

		await page.click("#routes-prefs-toggle");
		const chip = page.locator(".route-chip[data-pref=scout]");
		await chip.click();
		await expect(page.locator("#routes-origin")).toContainText("EVE-Scout not loading");
		await expect(amarr.locator(".route-link.is-scout")).toHaveCount(0);

		// Off and on again once it answers: Jita, Thera, Amarr.
		fail = false;
		await chip.click(); await chip.click();
		await expect(page.locator("#routes-origin")).toContainText("with EVE-Scout");
		await expect(amarr.locator(".route-jumps")).toHaveText("2j");
		await expect(amarr.locator(".route-link.is-scout")).toHaveCount(2);
		await expect(amarr.locator(".route-hop").nth(1)).toHaveAttribute("data-tip", /^Thera \(C12\) · EVE-Scout hole ABC-001, 10h left$/);
	});

	test("the nearest of a kind is added from the menu, names its system and station, and is kept", async ({ page }) => {
		const saved = [];
		page.on("request", r => { if (/options\.php/.test(r.url()) && r.method() === "POST") { saved.push(decodeURIComponent(r.postData() || "")); } });
		// From a trade hub that is not itself a blue loot buyer, by gates alone, whatever the mask's chain holds today.
		const hubName = await page.evaluate(() => {
			tripwire.routesPanel.useSource({ signatures: {}, wormholes: {}, scoutLinks: [] });
			const start = Object.keys(routePresets.sets.hubs).map(Number).find(id => !routePresets.sets.blue[id]);
			options.routes.from = "manual"; options.routes.fromSystem = start;
			tripwire.routesPanel.refresh(true);
			return appData.systems[start].name;
		});
		await expect(page.locator("#routes-nearest option")).toHaveText(["Nearest…", "Trade hub", "Blue loot", "Red loot", "Security office", "Thera hole", "Turnur hole"]);
		await page.selectOption("#routes-nearest", "blue");

		const want = await page.evaluate(() => {
			const from = options.routes.fromSystem, route = tripwire.route.plan(from, Object.keys(routePresets.sets.blue).map(Number), options.routes.prefs, { signatures: {}, wormholes: {}, scoutLinks: [] });
			const stations = routePresets.sets.blue[route.to].map(id => routePresets.stations[id]);
			return { name: appData.systems[route.to].name, jumps: route.jumps, stations, stationId: routePresets.sets.blue[route.to][0] };
		});
		const blue = page.locator('#routes-list .route-card[data-nearest="blue"]');
		await expect(blue.locator(".route-kind")).toHaveText("Blue loot");
		await expect(blue.locator(".route-name")).toHaveText(want.name);
		expect(want.jumps).toBeGreaterThan(0);
		await expect(blue.locator(".route-jumps")).toHaveText(want.jumps + "j");
		await expect(blue.locator(".route-hop")).toHaveCount(want.jumps + 1);
		await expect(blue.locator(".route-station-name")).toHaveText(want.stations[0]);
		if (want.stations.length > 1) { await expect(blue.locator(".route-station-more")).toHaveText("+" + (want.stations.length - 1)); }

		// It has left the menu, and it is saved with the account.
		await expect(page.locator("#routes-nearest option")).toHaveText(["Nearest…", "Trade hub", "Red loot", "Security office", "Thera hole", "Turnur hole"]);
		await expect(page.locator("#routes-nearest")).toHaveValue("");
		await expect.poll(() => saved.some(s => s.includes('"nearest":["blue"]'))).toBe(true);

		// Standing in a trade hub: no jumps, and the hub's own station.
		await page.selectOption("#routes-nearest", "hubs");
		await expect.poll(() => saved.some(s => s.includes('"nearest":["blue","hubs"]'))).toBe(true);
		const hub = page.locator('#routes-list .route-card[data-nearest="hubs"]');
		await expect(hub.locator(".route-name")).toHaveText(hubName);
		await expect(hub.locator(".route-here")).toHaveText("You are here.");
		await expect(hub.locator(".route-station-name")).toHaveText(await page.evaluate(() => routePresets.stations[routePresets.sets.hubs[options.routes.fromSystem][0]]));

		await page.reload();
		await page.waitForFunction(() => window.tripwire && tripwire.routesPanel && tripwire.timer, null, { timeout: 30000 });
		await expect(page.locator('#routes-list .route-card[data-nearest="blue"]')).toBeVisible();
		await expect(page.locator('#routes-list .route-card[data-nearest="hubs"]')).toBeVisible();

		await page.locator('#routes-list .route-card[data-nearest="blue"] .route-remove').click();
		await expect(page.locator('#routes-list .route-card[data-nearest="blue"]')).toHaveCount(0);
		await expect(page.locator("#routes-nearest option")).toHaveText(["Nearest…", "Blue loot", "Red loot", "Security office", "Thera hole", "Turnur hole"]);
		await expect.poll(() => saved.some(s => s.includes('"nearest":["hubs"]'))).toBe(true);
	});

	test("the nearest follows the preferences, and the arrow sends the autopilot to the station", async ({ page }) => {
		// Two buyers: Tama, in low-sec next door to where we start, and Jita, in high-sec further off.
		const ids = await page.evaluate(() => {
			const idOf = n => Number(Object.keys(appData.systems).find(k => appData.systems[k].name === n));
			const ids = { TAMA: idOf("Tama"), JITA: idOf("Jita"), START: idOf("Nourvukaiken") };
			tripwire.routesPanel.useSource({ signatures: {}, wormholes: {}, scoutLinks: [],
				presets: { sets: { blue: { [ids.TAMA]: [61], [ids.JITA]: [62, 63] } }, stations: { 61: "Tama station", 62: "Jita station", 63: "Jita other station" } } });
			options.routes.from = "manual"; options.routes.fromSystem = ids.START;
			// A tracked pilot the arrow can act for, and somewhere for its call to land.
			window.__sent = [];
			options.tracking.active = options.tracking.active || "1";
			tripwire.esi.characters[options.tracking.active] = tripwire.esi.characters[options.tracking.active] || { accessToken: "x" };
			tripwire.esi.setDestination = (id, who, clear) => { window.__sent.push([id, clear]); };
			tripwire.routesPanel.addNearest("blue");
			return ids;
		});
		const blue = page.locator('#routes-list .route-card[data-nearest="blue"]');
		await expect(blue.locator(".route-name")).toHaveText("Tama");
		await expect(blue.locator(".route-jumps")).toHaveText("1j");
		await expect(blue.locator(".route-station-name")).toHaveText("Tama station");

		await page.click("#routes-prefs-toggle");
		await page.selectOption("#routes-mode", "safer");
		await expect(blue.locator(".route-name")).toHaveText("Jita");
		await expect(blue.locator(".route-station-more")).toHaveText("+1");
		await expect(blue.locator(".route-station")).toHaveAttribute("data-tip", "Jita station<br>Jita other station");
		await expect(blue.locator(".route-fly")).toHaveAttribute("data-tip", "Set in-game destination: Jita station");
		await blue.locator(".route-fly").click();
		expect(await page.evaluate(() => window.__sent)).toEqual([[62, true]]);

		// Avoiding the one it found leaves the other, and avoiding both leaves none.
		await page.selectOption("#routes-mode", "shortest");
		await page.evaluate((ids) => { options.routes.prefs.avoid = [ids.TAMA]; tripwire.routesPanel.refresh(true); }, ids);
		await expect(blue.locator(".route-name")).toHaveText("Jita");
		await page.evaluate((ids) => { options.routes.prefs.avoid = [ids.TAMA, ids.JITA]; tripwire.routesPanel.refresh(true); }, ids);
		await expect(blue.locator(".route-kind")).toHaveText("Blue loot");
		await expect(blue.locator(".route-name")).toHaveCount(0);
		await expect(blue.locator(".route-none")).toHaveText("No blue loot buyer with these preferences.");
	});

	test("Thera with no hole offers EVE-Scout, and the palette adds the nearest of a kind", async ({ page }) => {
		const ids = await page.evaluate(() => {
			const idOf = n => Number(Object.keys(appData.systems).find(k => appData.systems[k].name === n));
			return { JITA: idOf("Jita"), THERA: idOf("Thera") };
		});
		const link = { id: "1", wh_exits_outward: true, wh_type: "Q063", max_ship_size: "large", remaining_hours: 10, out_system_id: ids.THERA, out_system_name: "Thera", out_signature: "THR-001", in_system_id: ids.JITA, in_signature: "ABC-001" };
		await page.route(/cached_third_party\.php\?key=eve-scout-signatures/, r => r.fulfill({ contentType: "application/json", body: JSON.stringify([link]) }));
		await page.evaluate((ids) => { tripwire.routesPanel.useSource(null); eveScout.links = []; options.routes.from = "manual"; options.routes.fromSystem = ids.JITA; tripwire.routesPanel.addDestination(ids.THERA); }, ids);
		const thera = card(page, "Thera");
		await expect(thera.locator(".route-none")).toHaveText("No hole to Thera on this chain. Use EVE-Scout");
		await thera.locator(".route-use-scout").click();
		await expect(thera.locator(".route-jumps")).toHaveText("1j");
		await expect(thera.locator(".route-link.is-scout")).toHaveCount(1);
		expect(await page.evaluate(() => options.routes.prefs.scout)).toBe(true);

		await page.locator("body").click({ position: { x: 5, y: 400 } });
		await page.keyboard.press("/");
		await page.fill("#cmd-input", "nearest sec");
		await page.locator("#cmd-list li", { hasText: "Route to nearest security office" }).click();
		await expect(page.locator('#routes-list .route-card[data-nearest="sec"] .route-kind')).toHaveText("Security office");
		await page.keyboard.press("/");
		await page.fill("#cmd-input", "security off");
		await expect(page.locator("#cmd-list li", { hasText: "Remove route to nearest security office" })).toBeVisible();
		await page.keyboard.press("Escape");
	});

	test("the nearest Thera or Turnur hole is the way in that EVE-Scout lists, with its signature", async ({ page }) => {
		const ids = await page.evaluate(() => {
			const idOf = n => Number(Object.keys(appData.systems).find(k => appData.systems[k].name === n));
			return { JITA: idOf("Jita"), AMARR: idOf("Amarr"), DODIXIE: idOf("Dodixie"), PERIMETER: idOf("Perimeter"), THERA: idOf("Thera"), TURNUR: idOf("Turnur") };
		});
		let fail = true;
		const link = (id, hub, hubName, other, sig, hours, size) => ({ id: String(id), wh_exits_outward: true, wh_type: "Q063", max_ship_size: size, remaining_hours: hours, out_system_id: hub, out_system_name: hubName, out_signature: "HUB-00" + id, in_system_id: other, in_signature: sig });
		const links = [
			link(1, ids.THERA, "Thera", ids.PERIMETER, "ABC-001", 2, "large"),        // next door, but nearly gone
			link(2, ids.THERA, "Thera", ids.AMARR, "DEF-002", 12, "large"),
			link(3, ids.THERA, "Thera", ids.AMARR, "GHI-003", 9, "medium"),
			link(4, ids.TURNUR, "Turnur", ids.DODIXIE, "JKL-004", 10, "large")
		];
		await page.route(/cached_third_party\.php\?key=eve-scout-signatures/, r => fail ? r.fulfill({ status: 500, body: "no" }) : r.fulfill({ contentType: "application/json", body: JSON.stringify(links) }));
		// Gates only, from Jita; the panel fetches EVE-Scout's list itself.
		await page.evaluate((ids) => { tripwire.routesPanel.useSource(null); eveScout.links = []; options.routes.from = "manual"; options.routes.fromSystem = ids.JITA; tripwire.routesPanel.refresh(true); }, ids);

		await page.selectOption("#routes-nearest", "thera");
		const thera = page.locator('#routes-list .route-card[data-nearest="thera"]');
		await expect(thera.locator(".route-kind")).toHaveText("Thera hole");
		await expect(thera.locator(".route-none")).toHaveText("EVE-Scout is not loading.");

		// Once it answers: Perimeter, one jump, and the signature to warp to.
		fail = false;
		await thera.locator(".route-remove").click();
		await page.selectOption("#routes-nearest", "thera");
		await expect(thera.locator(".route-name")).toHaveText("Perimeter");
		await expect(thera.locator(".route-jumps")).toHaveText("1j");
		await expect(thera.locator(".route-station-name")).toHaveText("ABC-001 · 2h left");
		await expect(thera.locator(".route-link.is-scout")).toHaveCount(0);       // to the way in, not through it
		expect(await page.evaluate(() => options.routes.prefs.scout)).toBe(false); // and without turning the preference on

		// Skipping holes near their end leaves Amarr's two, the longer-lived first.
		await page.click("#routes-prefs-toggle");
		await page.locator(".route-chip[data-pref=skipEol]").click();
		await expect(thera.locator(".route-name")).toHaveText("Amarr");
		await expect(thera.locator(".route-station-name")).toHaveText("DEF-002 · 12h left");
		await expect(thera.locator(".route-station-more")).toHaveText("+1");
		await expect(thera.locator(".route-station")).toHaveAttribute("data-tip", "DEF-002 · Q063 · large · 12h left<br>GHI-003 · Q063 · medium · 9h left");
		// A ship too big for the medium hole still has the large one; too big for both has none.
		await page.selectOption("#routes-ship", "l");
		await expect(thera.locator(".route-station-more")).toHaveCount(0);
		await page.selectOption("#routes-ship", "xl");
		await expect(thera.locator(".route-none")).toHaveText("No Thera hole with these preferences.");
		await page.selectOption("#routes-ship", "");

		await page.selectOption("#routes-nearest", "turnur");
		const turnur = page.locator('#routes-list .route-card[data-nearest="turnur"]');
		await expect(turnur.locator(".route-kind")).toHaveText("Turnur hole");
		await expect(turnur.locator(".route-name")).toHaveText("Dodixie");
		await expect(turnur.locator(".route-station-name")).toHaveText("JKL-004 · 10h left");
		await expect(page.locator("#routes-nearest option")).toHaveText(["Nearest…", "Trade hub", "Blue loot", "Red loot", "Security office"]);
	});

	test("the chain map's menu adds the system under the pointer", async ({ page }) => {
		await login(page, "Perimeter");                                       // a view whose chain tab draws its root
		await page.evaluate(() => { options.routes.from = "manual"; options.routes.fromSystem = Number(Object.keys(appData.systems).find(k => appData.systems[k].name === "Amarr")); tripwire.routesPanel.refresh(true); });
		const node = page.locator("#chainMap .nodeSystem a").first();
		await expect(node).toBeVisible();
		const name = (await node.textContent()).trim();
		await node.click({ button: "right" });
		await page.locator("#chainMenu li", { hasText: "Add to routes" }).click();
		await expect(card(page, name)).toBeVisible();
		await node.click({ button: "right" });
		await expect(page.locator("#chainMenu li", { hasText: "Remove from routes" })).toBeVisible();
		await page.locator("#chainMenu li", { hasText: "Remove from routes" }).click();
		await expect(card(page, name)).toHaveCount(0);
	});

	test("four panels share the row; putting Routes away gives its column back", async ({ page }) => {
		const columns = () => page.evaluate(() => getComputedStyle(document.querySelector(".gridster > ul")).gridTemplateColumns.split(" ").length);
		const tops = () => page.evaluate(() => ["infoWidget", "signaturesWidget", "notesWidget", "routesWidget"].map(id => Math.round(document.getElementById(id).getBoundingClientRect().top)));
		expect(await columns()).toBe(4);
		expect(new Set(await tops()).size).toBe(1);                       // one row
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

		await page.locator("#routesWidget .panel-hide").click();
		await expect(page.locator("#routesWidget")).toBeHidden();
		expect(await columns()).toBe(3);
		expect(await page.evaluate(() => document.querySelector(".gridster > ul").style.gridTemplateColumns)).toBe("");   // the stylesheet's own three

		// Adding a destination from elsewhere brings the panel back.
		await page.evaluate(() => tripwire.routesPanel.addDestination(Number(Object.keys(appData.systems).find(k => appData.systems[k].name === "Amarr"))));
		await expect(page.locator("#routesWidget")).toBeVisible();
		expect(await columns()).toBe(4);
	});

	test("on a phone the panel takes its place in the stack, with nothing running off the side", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.evaluate(() => { tripwire.routesPanel.useSource({ signatures: {}, wormholes: {}, scoutLinks: [] }); options.routes.from = "system"; ["Amarr", "Dodixie"].forEach(n => tripwire.routesPanel.addDestination(Number(Object.keys(appData.systems).find(k => appData.systems[k].name === n)))); });
		const panel = page.locator("#routesWidget");
		await panel.scrollIntoViewIfNeeded();
		await expect(card(page, "Amarr")).toBeVisible();
		const box = await panel.boundingBox();
		expect(box.x).toBeGreaterThanOrEqual(0);
		expect(box.x + box.width).toBeLessThanOrEqual(390);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
		const strip = await card(page, "Amarr").locator(".route-strip").boundingBox();
		expect(strip.x + strip.width).toBeLessThanOrEqual(box.x + box.width);
	});
});
