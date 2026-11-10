// Bookmarks pasted like a scan: the server's convention (the brand pack's
// words laid over the default), a pilot's own, and what a paste does to the
// map. Fixtures are signatures under the ZZQ prefix in Perimeter and the far
// sides of their connections; every test removes them before and after.
const { test } = require("@playwright/test");
const { login, setClipboard, expect } = require("./helpers");

const PASTE_KEY = process.platform === "darwin" ? "Meta+V" : "Control+V";
// One row as EVE copies it from People & Places: label, folder, date.
const row = (label) => label + "\tE2E bookmarks\t2026.11.10 21:44";

async function usePack(context, baseURL, slug) {
	await context.addCookies([{ name: "tripwire_brand", value: slug, url: baseURL }]);
}

// ZZQ signatures in the viewed system, each with the far side of its connection.
const fixtures = (page) => page.evaluate(() => {
	const sigs = tripwire.client.signatures || {}, holes = tripwire.client.wormholes || {};
	return Object.values(sigs).filter(s => s.systemID == viewingSystemID && /^zzq/i.test(s.signatureID || "")).map(s => {
		const h = Object.values(holes).find(w => w.initialID == s.id || w.secondaryID == s.id);
		const other = h ? sigs[h.initialID == s.id ? h.secondaryID : h.initialID] : null;
		return { sig: s, hole: h || null, other: other || null };
	});
});

async function cleanup(page) {
	const ids = (await fixtures(page)).flatMap(f => [f.sig.id].concat(f.other ? [f.other.id] : []));
	if (ids.length) {
		await page.evaluate((ids) => new Promise((res) => tripwire.refresh("refresh", { signatures: { remove: ids }, systemID: viewingSystemID }, () => res(), () => setTimeout(res, 500))), ids);
	}
	await page.waitForFunction(() => !Object.values(tripwire.client.signatures || {}).some(s => s.systemID == viewingSystemID && /^zzq/i.test(s.signatureID || "")), null, { timeout: 15000 });
}

const fixture = (page, test) => page.waitForFunction((test) => {
	const s = Object.values(tripwire.client.signatures || {}).find(s => s.systemID == viewingSystemID && /^zzq/i.test(s.signatureID || ""));
	return s && new Function("s", "return " + test)(s) ? true : false;
}, test, { timeout: 15000 });

test.describe("bookmarks", () => {
	test.beforeEach(async ({ context }) => { await context.grantPermissions(["clipboard-read", "clipboard-write"]); });
	test.afterEach(async ({ page }) => { await cleanup(page).catch(() => {}); });

	test("WINGSPAN's words: a hole bookmark adds a connection to the right class, end of life and mass critical", async ({ page, context, baseURL }) => {
		await usePack(context, baseURL, "wingspan");
		await login(page, "Perimeter");
		await cleanup(page);
		expect(await page.evaluate(() => window.TW_BOOKMARK_CONVENTION && window.TW_BOOKMARK_CONVENTION.name)).toBe("the WDS convention");

		await setClipboard(page, row("C2 ZZQ ??? EOL CRIT"));
		await page.locator("body").click({ position: { x: 5, y: 400 } });
		await page.keyboard.press(PASTE_KEY);
		await expect(page.getByText("Bookmark read")).toBeVisible();
		await expect(page.locator("#fullPaste")).toHaveCount(0);   // bookmarks are no full scan: nothing offered for deletion

		await fixture(page, "true");
		const [f] = await fixtures(page);
		expect(f.sig.type).toBe("wormhole");
		expect(f.hole.life).toBe("critical");
		expect(f.hole.mass).toBe("critical");
		expect(await page.evaluate((id) => appData.genericSystemTypes[id], f.other.systemID)).toBe("Class-2");

		// A second bookmark for the same hole, now with its digits and a softer
		// mass: the same connection takes the full id, and mass stays critical.
		await setClipboard(page, row("C2 ZZQ-123 ??? <50%"));
		await page.click("#paste-signatures");
		await fixture(page, "s.signatureID.toUpperCase().replace('-', '') === 'ZZQ123'");
		const after = await fixtures(page);
		expect(after.length).toBe(1);
		expect(after[0].hole.id).toBe(f.hole.id);
		expect(after[0].hole.mass).toBe("critical");
		expect(after[0].hole.life).toBe("critical");
	});

	test("the default words do not know EOL; a site bookmark is a site, by the Paste button too", async ({ page, context, baseURL }) => {
		await usePack(context, baseURL, "tripwire");
		await login(page, "Perimeter");
		await cleanup(page);
		expect(await page.evaluate(() => window.TW_BOOKMARK_CONVENTION || null)).toBeNull();
		expect(await page.evaluate(() => tripwire.bookmarks.parse("C2 ABC EOL", tripwire.pasteSignatures.convention()).life)).toBeUndefined();

		await setClipboard(page, row("GS ZZQ-456 Sizeable Perimeter Reservoir"));
		await page.click("#paste-signatures");
		await expect(page.getByText("Bookmark read")).toBeVisible();
		await expect(page.locator("#fullPaste")).toHaveCount(0);
		await fixture(page, "s.type === 'gas'");
		const [f] = await fixtures(page);
		expect(f.sig.name).toBe("Sizeable Perimeter Reservoir");
		expect(f.hole).toBeNull();
	});

	test("a scan still offers to delete missing sigs", async ({ page, context, baseURL }) => {
		await usePack(context, baseURL, "wingspan");
		await login(page, "Perimeter");
		await cleanup(page);
		await setClipboard(page, "ZZQ-789\tCosmic Signature\tRelic Site\tE2E scan\t100.0%\t1.00 AU");
		await page.click("#paste-signatures");
		await expect(page.locator("#fullPaste")).toBeVisible();
		await fixture(page, "s.type === 'relic'");
	});

	test("bookmarks pasted into the search box still land", async ({ page, context, baseURL }) => {
		await usePack(context, baseURL, "wingspan");
		await login(page, "Perimeter");
		await cleanup(page);
		await setClipboard(page, row("RC ZZQ-321 Forgotten Frontier Quarantine Outpost"));
		await page.click("#search");   // opens the system search, focus in its field
		const field = page.locator("#systemSearch input[name=system]");
		await expect(field).toBeFocused();
		await page.keyboard.press(PASTE_KEY);
		await fixture(page, "s.type === 'relic'");
		expect(await field.inputValue()).toBe("");
	});
});

test.describe("Settings > Bookmarks", () => {
	test.afterEach(async ({ page }) => {
		await page.evaluate(async () => { options.bookmarks = JSON.parse(JSON.stringify(options.reset.defaults.bookmarks)); await options.save(); }).catch(() => {});
	});

	test("shows the server's words, locked; your own words are saved with the account and read pastes", async ({ page, context, baseURL }) => {
		await usePack(context, baseURL, "wingspan");
		await login(page, "Perimeter");
		await page.click("#settings");
		await page.click("#optionsAccordion [role=tab][data-tab=bookmarks]");
		const pane = page.locator("[data-pane=bookmarks]");
		await expect(pane).toBeVisible();
		await expect(page.locator("#bm-source")).toHaveText("this server uses the WDS convention.");
		const eol = pane.locator("[data-bm='life.critical']");
		await expect(eol).toHaveValue("<4H, EOL");
		await expect(eol).toBeDisabled();

		await page.fill("#bm-try", "C2 ABC ??? EOL CRIT");
		await expect(page.locator("#bm-result")).toHaveText("Wormhole, signature ABC, to class 2, end of life, mass under 10%");

		await page.locator("label.switch:has(#bm-own) .switch-track").click();
		await expect(eol).toBeEnabled();
		await expect(eol).toHaveValue("<4H, EOL");   // your own words start from the server's
		await eol.fill("DOOM");
		await page.fill("#bm-try", "C2 ABC DOOM");
		await expect(page.locator("#bm-result")).toContainText("end of life");
		await page.locator(".ui-dialog:visible").getByRole("button", { name: "Save", exact: true }).click();

		expect(await page.evaluate(() => options.bookmarks.own)).toBe(true);
		expect(await page.evaluate(() => options.bookmarks.convention.life.critical)).toEqual(["DOOM"]);
		expect(await page.evaluate(() => tripwire.bookmarks.parse("C2 ABC DOOM", tripwire.pasteSignatures.convention()).life)).toBe("critical");
		expect(await page.evaluate(() => tripwire.bookmarks.parse("C2 ABC EOL", tripwire.pasteSignatures.convention()).life)).toBeUndefined();
	});
});
