// The app comes up: header, four panels, a live poll, no console errors.
const { test } = require("@playwright/test");
const { login, expect } = require("./helpers");

test("the app loads clean and polls", async ({ page }) => {
	const errors = [];
	page.on("pageerror", (e) => errors.push(String(e)));
	await login(page, "Perimeter");
	await expect(page.locator("#hdr-system")).toHaveText(/Perimeter/);
	await expect(page.locator(".gridWidget:visible")).toHaveCount(4);
	await expect(page.locator("#user-avatar")).toBeVisible();

	// The poll loop reschedules: the timer id must change.
	const t1 = await page.evaluate(() => tripwire.timer);
	await page.waitForFunction((t) => tripwire.timer !== t, t1, { timeout: 20000 });
	expect(errors).toEqual([]);
});

// Login and the landing page's button both send people to ?system= with no
// value. That used to bounce to ?system=Jita and stay there. Now the page
// boots in place and the tracked pilot's first known location becomes the
// view, once; a pilot who has already moved on is left alone.
test("a fresh entry boots in place and opens on the tracked pilot's system", async ({ page }) => {
	await page.goto("/?system=");
	await page.waitForFunction(() => window.tripwire && tripwire.client && tripwire.timer && document.querySelector("#sigTable"), null, { timeout: 30000 });
	await page.waitForTimeout(2000);
	const boot = await page.evaluate(() => ({
		navigation: performance.getEntriesByType("navigation")[0].name,
		viewingName: viewingSystem,
		pending: typeof defaultToTrackedSystem !== "undefined" && defaultToTrackedSystem
	}));
	expect(boot.navigation).toMatch(/\?system=$/);   // no reload happened
	expect(boot.viewingName).toBe("Jita");

	if (boot.pending) {
		// No pilot location has arrived; hand the page one the way ESI would.
		const KISOGO = 30000141, IKUCHI = 30000138;
		await page.evaluate((id) => { options.buttons.follow = false; tripwire.EVE({ characterID: 1, characterName: "Probe", systemID: id, systemName: "Kisogo" }); }, KISOGO);
		await page.waitForFunction((id) => Number(viewingSystemID) === id, KISOGO, { timeout: 15000 });
		expect(await page.evaluate(() => location.search)).toBe("?system=Kisogo");

		// The pilot moves on by hand; a later location must not yank the view.
		await page.evaluate((id) => tripwire.systemChange(id), IKUCHI);
		await page.waitForFunction((id) => Number(viewingSystemID) === id, IKUCHI, { timeout: 15000 });
		await page.evaluate((id) => tripwire.EVE({ characterID: 1, characterName: "Probe", systemID: id, systemName: "Kisogo" }), KISOGO);
		await page.waitForTimeout(1500);
		expect(await page.evaluate(() => Number(viewingSystemID))).toBe(IKUCHI);
	} else {
		expect(await page.evaluate(() => Number(viewingSystemID) === Number(tripwire.client.EVE.systemID))).toBe(true);
	}
});
