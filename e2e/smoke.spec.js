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
		viewingID: Number(viewingSystemID),
		tracked: tripwire.client.EVE && tripwire.client.EVE.systemID ? Number(tripwire.client.EVE.systemID) : null,
		pending: typeof defaultToTrackedSystem !== "undefined" && defaultToTrackedSystem
	}));
	expect(boot.navigation).toMatch(/\?system=$/);   // no reload happened
	// Either still on the bootstrap system, or the tracked pilot's location
	// already arrived and won (its record can be momentarily empty between
	// polls, so the stable fact is that the view has left Jita).
	const JITA = 30000142;
	if (boot.pending) { expect(boot.viewingName).toBe("Jita"); }
	else { expect(boot.viewingID).not.toBe(JITA); }

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
		expect(await page.evaluate(() => Number(viewingSystemID))).not.toBe(JITA);
	}
});

// In wormhole space the System panel's graph gives way to zKillboard's kill
// stream; in k-space the graph stays and the stream is gone.
test("a wormhole system shows the kill stream, a k-space system the graph", async ({ page }) => {
	await login(page, "Perimeter");
	await expect(page.locator("#killStream")).toBeHidden();
	await expect(page.locator("#activityGraph")).toBeVisible();
	await page.evaluate(() => tripwire.systemChange(31000005));
	await page.waitForFunction(() => Number(viewingSystemID) === 31000005);
	await expect(page.locator("#infoWidget")).toHaveClass(/is-wormhole/);
	await expect(page.locator("#killStream")).toBeVisible();
	await expect(page.locator("#activityGraph")).toBeHidden();
	// Either the board had kills and the strip lists them, or it had none and our quiet line shows.
	await expect.poll(async () => {
		const n = await page.locator("#killStreamStrip .kill").count();
		const quiet = await page.locator("#killStream").evaluate(e => e.classList.contains("is-quiet"));
		return n > 0 || quiet;
	}, { timeout: 20000 }).toBe(true);
	await expect(page.locator("#killStream > #infoLinks.in-killstream-foot")).toBeVisible();   // the links close the section
	await expect(page.locator("#killStreamLink")).toHaveAttribute("href", /zkillboard\.com\/system\/31000005\//);
	await page.evaluate(() => tripwire.systemChange(30000144));
	await page.waitForFunction(() => Number(viewingSystemID) === 30000144);
	await expect(page.locator("#killStream")).toBeHidden();
	await expect(page.locator("#activityGraph")).toBeVisible();
	await expect(page.locator("#activityGraphControls #infoLinks")).toBeVisible(); // and back
});
