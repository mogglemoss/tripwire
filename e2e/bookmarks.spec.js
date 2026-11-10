// Bookmarks pasted like a scan: what EVE names, the server's words (the brand
// pack's laid over Tripwire's own), a pilot's own, and what a paste does to
// the map. Fixtures are signatures under the ZZQ prefix in Perimeter and the
// far sides of their connections; every test removes them before and after.
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

		await setClipboard(page, row("C2 ZZQ ??? <4H CRIT"));
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

	test("with no server words: what EVE names is read, a corp's words are not; by the Paste button too", async ({ page, context, baseURL }) => {
		await usePack(context, baseURL, "tripwire");
		await login(page, "Perimeter");
		await cleanup(page);
		expect(await page.evaluate(() => window.TW_BOOKMARK_CONVENTION || null)).toBeNull();
		expect(await page.evaluate(() => tripwire.bookmarks.parse("C2 ABC <4H", tripwire.pasteSignatures.convention()).life)).toBeUndefined();

		// A wormhole type says where it goes; Tripwire's own label says end of life.
		await setClipboard(page, row("ZZQ-654 B274 EOL"));
		await page.click("#paste-signatures");
		await expect(page.getByText("Bookmark read")).toBeVisible();
		await expect(page.locator("#fullPaste")).toHaveCount(0);
		await fixture(page, "s.type === 'wormhole'");
		let [f] = await fixtures(page);
		expect(f.hole.life).toBe("critical");
		expect(await page.evaluate((id) => appData.genericSystemTypes[id], f.other.systemID)).toBe("High-Sec");
		await cleanup(page);

		// A full id and a site's own name is that site.
		await setClipboard(page, row("ZZQ-456 Sizeable Perimeter Reservoir"));
		await page.click("#paste-signatures");
		await fixture(page, "s.type === 'gas'");
		[f] = await fixtures(page);
		expect(f.sig.name).toBe("Sizeable Perimeter Reservoir");
		expect(f.hole).toBeNull();
	});

	test("a chain name with the hole's id names the connection; a chain name alone changes nothing", async ({ page, context, baseURL }) => {
		await usePack(context, baseURL, "tripwire");
		await login(page, "Perimeter");
		await cleanup(page);
		await setClipboard(page, "ZZQ-777\tCosmic Signature\tWormhole\tUnstable Wormhole\t100.0%\t1.00 AU");
		await page.click("#paste-signatures");
		await fixture(page, "s.type === 'wormhole'");
		const [before] = await fixtures(page);
		expect(before.hole).not.toBeNull();

		const offers = await page.locator("#fullPaste").count();   // the scan's own notice may still be up
		await setClipboard(page, row("A31"));
		await page.click("#paste-signatures");
		await expect(page.getByText("Nothing here looked like scanner results or bookmarks.")).toBeVisible();
		await expect(page.locator("#fullPaste")).toHaveCount(offers);   // no new offer to delete every sig
		await page.waitForTimeout(2000);
		expect((await fixtures(page))[0].sig.name || "").toBe(before.sig.name || "");

		await setClipboard(page, row("ZZQ-777 A31"));
		await page.click("#paste-signatures");
		await fixture(page, "s.name === 'A31'");
		const after = await fixtures(page);
		expect(after.length).toBe(1);
		expect(after[0].hole.id).toBe(before.hole.id);
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
		await setClipboard(page, row("ZZQ-321 Forgotten Frontier Quarantine Outpost"));
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

	test("shows the server's words as chips; your own words are rows, saved with the account, and read pastes", async ({ page, context, baseURL }) => {
		await usePack(context, baseURL, "wingspan");
		await login(page, "Perimeter");
		await page.click("#settings");
		await page.click("#optionsAccordion [role=tab][data-tab=bookmarks]");
		const pane = page.locator("[data-pane=bookmarks]");
		await expect(pane).toBeVisible();
		await expect(page.locator("#bm-source")).toHaveText("this server uses the WDS convention");
		await expect(pane.locator(".bm-chip", { hasText: "End of life" }).locator("b")).toHaveText("<4H · EOL");
		await expect(pane.locator(".bm-row")).toHaveCount(0);

		await page.fill("#bm-try", "C2 ABC ??? EOL CRIT");
		await expect(page.locator("#bm-result")).toHaveText("Wormhole, signature ABC, to class 2, end of life, mass under 10%");

		await page.locator("label.switch:has(#bm-own) .switch-track").click();
		await expect(pane.locator(".bm-chip")).toHaveCount(0);
		const words = await pane.locator(".bm-row .bm-word").evaluateAll(els => els.map(e => e.value));
		expect(words).toEqual(expect.arrayContaining(["<4H", "EOL", "CRIT"]));   // your own words start from the server's
		await pane.locator(".bm-row").nth(words.indexOf("EOL")).locator(".bm-word").fill("DOOM");
		await pane.locator(".bm-row").nth(words.indexOf("CRIT")).locator(".bm-remove").click();
		await page.click("#bm-add");
		const added = pane.locator(".bm-row").last();
		await expect(added.locator(".bm-word")).toBeFocused();
		await added.locator(".bm-word").fill("squid");
		// The meaning picker lists each meaning with its words; aliases are marked.
		await added.locator(".bm-meaning-button").click();
		const menu = page.locator(".bm-menu.ui-selectmenu-open");
		await expect(menu).toBeVisible();
		await expect(menu.locator("li.bm-menu-alias", { hasText: "End of life" }).locator(".bm-menu-words")).toHaveText("<4H = DOOM");
		await menu.locator("li", { hasText: /^Caldari/ }).click();
		await expect(added.locator(".bm-meaning")).toHaveValue("factions.Caldari");
		// Aliases, several words for one meaning, are marked and listed together.
		await expect(page.locator("#bm-aliases .bm-alias", { hasText: "End of life" }).locator("b")).toHaveText("<4H = DOOM");
		await expect(pane.locator(".bm-row.is-alias")).toHaveCount(2);   // <4H and DOOM; CRIT was removed above
		// A word given a second meaning is flagged on both rows, and clears when fixed.
		const c2 = pane.locator(".bm-row").nth(words.indexOf("C2"));
		await added.locator(".bm-word").fill("C2");
		await expect(pane.locator(".bm-row.is-dup")).toHaveCount(2);
		await expect(page.locator("#bm-dups")).toHaveText("C2 is listed as Class 2 and Caldari. A word can mean only one thing.");
		await expect(c2).toHaveClass(/is-dup/);
		await added.locator(".bm-word").fill("squid");
		await expect(pane.locator(".bm-row.is-dup")).toHaveCount(0);
		await expect(page.locator("#bm-dups")).toBeHidden();
		await page.fill("#bm-try", "C2 ABC DOOM");
		await expect(page.locator("#bm-result")).toContainText("end of life");
		await page.locator(".ui-dialog:visible").getByRole("button", { name: "Save", exact: true }).click();

		const saved = await page.evaluate(() => options.bookmarks);
		expect(saved.own).toBe(true);
		expect(saved.convention.life.critical).toEqual(["<4H", "DOOM"]);
		expect(saved.convention.mass.critical).toEqual(["<10%"]);
		expect(saved.convention.factions.Caldari).toEqual(["SQUID"]);
		const read = (t) => page.evaluate((t) => tripwire.bookmarks.parse(t, tripwire.pasteSignatures.convention()), t);
		expect((await read("C2 ABC DOOM")).life).toBe("critical");
		expect((await read("C2 ABC EOL")).life).toBeUndefined();
		expect((await read("C2 ABC CRIT")).mass).toBeUndefined();

		// Reopened, the rows are as saved.
		await page.click("#settings");
		await page.click("#optionsAccordion [role=tab][data-tab=bookmarks]");
		await expect(page.locator("#bm-own")).toBeChecked();
		expect(await pane.locator(".bm-row .bm-word").evaluateAll(els => els.map(e => e.value))).toEqual(expect.arrayContaining(["DOOM", "SQUID"]));
	});
});
