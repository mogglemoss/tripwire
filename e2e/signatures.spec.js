// The ways signatures get into Tripwire, end to end against a real instance.
//
// Every test here creates its own fixtures under the ZZQ prefix and removes
// them afterwards through the same remove payload the UI sends, so the
// preview's real data is untouched and a failed run leaves nothing behind
// that the next run will not clear.
const { test } = require("@playwright/test");
const { login, clientSigIds, removeSigsByPrefix, chooseType, setClipboard, expect } = require("./helpers");

const SYSTEM = process.env.E2E_SYSTEM || "Perimeter";
const PREFIX = "zzq";

test.describe("signatures", () => {
	test.beforeEach(async ({ page }) => {
		await login(page, SYSTEM);
		await removeSigsByPrefix(page, PREFIX);
	});
	test.afterEach(async ({ page }) => {
		await removeSigsByPrefix(page, PREFIX).catch(() => {});
	});

	test("add a signature by hand: typed into the dialog, saved with Enter", async ({ page }) => {
		await page.click("#add-signature");
		const dlg = page.locator(".ui-dialog:visible");
		await expect(dlg.locator(".ui-dialog-title")).toHaveText(/Add Signature/);

		// Typed, not filled: this is the path the single-key shortcuts could
		// interfere with, and the path a person actually uses.
		await page.locator("#dialog-signature input[name=signatureID_Alpha]").click();
		await page.keyboard.type("ZZQ");
		await page.keyboard.press("Tab");
		await page.keyboard.type("101");
		await chooseType(page, "Data");
		await page.locator("#dialog-signature input[name=signatureName]").click();
		await page.keyboard.type("E2E data site");
		await page.keyboard.press("Enter");

		await expect(dlg).toBeHidden();
		await expect(page.locator("#sigTable tbody td:first-child", { hasText: /ZZQ-101/i })).toBeVisible();
		expect(await clientSigIds(page)).toContain("zzq101");
	});

	test("add a signature by hand: the Add button", async ({ page }) => {
		await page.click("#add-signature");
		const dlg = page.locator(".ui-dialog:visible");
		await page.fill("#dialog-signature input[name=signatureID_Alpha]", "ZZQ");
		await page.fill("#dialog-signature input[name=signatureID_Numeric]", "102");
		await chooseType(page, "Combat");
		await page.fill("#dialog-signature input[name=signatureName]", "E2E combat site");
		await dlg.getByRole("button", { name: "Add", exact: true }).click();

		await expect(dlg).toBeHidden();
		expect(await clientSigIds(page)).toContain("zzq102");
	});

	test("paste probe-scanner results with Ctrl-V anywhere on the page", async ({ page, context }) => {
		const scan = [
			"ZZQ-201\tCosmic Signature\tRelic Site\tE2E relic\t100.0%\t2.31 AU",
			"ZZQ-202\tCosmic Signature\tGas Site\tE2E gas\t100.0%\t4.10 AU",
			"ZZQ-203\tCosmic Signature\t\t\t12.5%\t9.00 AU"
		].join("\n");
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		await setClipboard(page, scan);

		// Nothing focused, Ctrl-V: paste.js focuses #clipboard and parses.
		await page.locator("body").click({ position: { x: 5, y: 400 } });
		await page.keyboard.press(process.platform === "darwin" ? "Meta+V" : "Control+V");

		await page.waitForFunction(() => Object.values((tripwire.client && tripwire.client.signatures) || {}).filter(s => /^zzq20/i.test(s.signatureID)).length >= 3, null, { timeout: 15000 });
		const ids = await clientSigIds(page);
		expect(ids).toEqual(expect.arrayContaining(["zzq201", "zzq202", "zzq203"]));
		const relic = await page.evaluate(() => Object.values((tripwire.client && tripwire.client.signatures) || {}).find(s => /zzq201/i.test(s.signatureID)));
		expect(relic.type).toBe("relic");
		expect(relic.name).toBe("E2E relic");
	});

	test("the Paste scan button ingests the clipboard", async ({ page, context }) => {
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		await setClipboard(page, "ZZQ-301\tCosmic Signature\tData Site\tE2E button paste\t100.0%\t1.00 AU");
		await page.click("#paste-signatures");
		await page.waitForFunction(() => Object.values((tripwire.client && tripwire.client.signatures) || {}).some(s => /zzq301/i.test(s.signatureID)), null, { timeout: 15000 });
		expect(await clientSigIds(page)).toContain("zzq301");
	});

	test("a pasted signature updates rather than duplicates", async ({ page, context }) => {
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		await setClipboard(page, "ZZQ-401\tCosmic Signature\t\t\t10.0%\t5.00 AU");
		await page.click("#paste-signatures");
		await page.waitForFunction(() => Object.values((tripwire.client && tripwire.client.signatures) || {}).some(s => /zzq401/i.test(s.signatureID)), null, { timeout: 15000 });
		await setClipboard(page, "ZZQ-401\tCosmic Signature\tOre Site\tE2E ore\t100.0%\t5.00 AU");
		await page.click("#paste-signatures");
		await page.waitForFunction(() => Object.values((tripwire.client && tripwire.client.signatures) || {}).some(s => /zzq401/i.test(s.signatureID) && s.type === "ore"), null, { timeout: 15000 });
		const matches = (await clientSigIds(page)).filter(id => id === "zzq401");
		expect(matches).toHaveLength(1);
	});

	test("undo removes what was just added", async ({ page }) => {
		await page.click("#add-signature");
		await page.fill("#dialog-signature input[name=signatureID_Alpha]", "ZZQ");
		await page.fill("#dialog-signature input[name=signatureID_Numeric]", "501");
		await chooseType(page, "Ore");
		await page.locator(".ui-dialog:visible").getByRole("button", { name: "Add", exact: true }).click();
		await page.waitForFunction(() => Object.values((tripwire.client && tripwire.client.signatures) || {}).some(s => /zzq501/i.test(s.signatureID)));
		await expect(page.locator("#undo")).not.toHaveClass(/disabled/);
		await page.click("#undo");
		await page.waitForFunction(() => !Object.values((tripwire.client && tripwire.client.signatures) || {}).some(s => /zzq501/i.test(s.signatureID)), null, { timeout: 15000 });
	});
});

test.describe("the traps", () => {
	test.beforeEach(async ({ page }) => { await login(page, SYSTEM); await removeSigsByPrefix(page, PREFIX); });
	test.afterEach(async ({ page }) => { await removeSigsByPrefix(page, PREFIX).catch(() => {}); });

	test("the signature dialog remains inside the viewport when it expands", async ({ page }) => {
		const viewport = { width: 800, height: 600 };
		await page.setViewportSize(viewport);
		await page.click("#add-signature");
		await chooseType(page, "Wormhole");

		const dialog = page.locator(".ui-dialog:visible");
		await expect(dialog.locator("#wormhole")).toBeVisible();
		await page.waitForFunction(() => !$("#dialog-signature #site, #dialog-signature #wormhole").is(":animated"));
		const bounds = await dialog.boundingBox();

		expect(bounds.x).toBeGreaterThanOrEqual(0);
		expect(bounds.y).toBeGreaterThanOrEqual(0);
		expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
		expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
	});

	test("typing the id then Tab does not skip the numeric half", async ({ page }) => {
		await page.click("#add-signature");
		await page.locator("#dialog-signature input[name=signatureID_Alpha]").click();
		await page.keyboard.type("ZZQ");     // auto-advances to the numeric field
		await page.keyboard.press("Tab");     // the habitual Tab must not skip it
		await page.keyboard.type("601");
		await expect(page.locator("#dialog-signature input[name=signatureID_Numeric]")).toHaveValue("601");
		await chooseType(page, "Gas");
		await page.locator(".ui-dialog:visible").getByRole("button", { name: "Add", exact: true }).click();
		await page.waitForFunction(() => Object.values((tripwire.client && tripwire.client.signatures) || {}).some(s => /zzq601/i.test(s.signatureID)), null, { timeout: 15000 });
	});

	test("a whole id pasted into the first field splits itself", async ({ page }) => {
		await page.click("#add-signature");
		await page.fill("#dialog-signature input[name=signatureID_Alpha]", "ZZQ-602");
		await expect(page.locator("#dialog-signature input[name=signatureID_Alpha]")).toHaveValue("ZZQ");
		await expect(page.locator("#dialog-signature input[name=signatureID_Numeric]")).toHaveValue("602");
	});

	test("Ctrl-V with the search box focused still ingests a scan", async ({ page, context }) => {
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		await setClipboard(page, "ZZQ-701\tCosmic Signature\tCombat Site\tE2E from search\t100.0%\t1.00 AU");
		await page.click("#hdr-system");   // opens search and focuses its input
		await expect(page.locator("#searchSpan input")).toBeFocused();
		await page.keyboard.press(process.platform === "darwin" ? "Meta+V" : "Control+V");
		await page.waitForFunction(() => Object.values((tripwire.client && tripwire.client.signatures) || {}).some(s => /zzq701/i.test(s.signatureID)), null, { timeout: 15000 });
		await expect(page.locator("#searchSpan input")).toHaveValue("");
	});
});

// The delete confirmation: says what and where, lists several, focuses the
// safe action, and deletes on Delete.
test.describe("delete confirmation", () => {
	const PREFIX = "ZZQ-8";
	test.beforeEach(async ({ page }) => { await login(page, "Perimeter"); await removeSigsByPrefix(page, PREFIX); });
	test.afterEach(async ({ page }) => { await removeSigsByPrefix(page, PREFIX).catch(() => {}); });

	async function pasteSigs(page, context, lines) {
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		await setClipboard(page, lines.join("\n"));
		await page.click("#paste-signatures");
		await page.waitForFunction((n) => (Object.values((tripwire.client && tripwire.client.signatures) || {}).filter(s => /zzq8/i.test(s.signatureID || "")).length) >= n, lines.length, { timeout: 15000 });
	}
	function row(page, id) { return page.locator("#sigTable tbody tr", { hasText: new RegExp(id, "i") }).first(); }

	test("one signature: lead names it and the system, Cancel is focused, Delete removes it", async ({ page, context }) => {
		await pasteSigs(page, context, ["ZZQ-801\tCosmic Signature\tRelic Site\tE2E delete me\t100.0%\t1.00 AU"]);
		await row(page, "ZZQ-801").click();
		await page.click("#delete-signature");
		const dialog = page.locator(".ui-dialog:visible");
		await expect(dialog).toBeVisible();
		await expect(dialog.locator(".ui-dialog-title")).toHaveText(/Delete signature/i);
		await expect(dialog.locator("#deleteSigLead")).toContainText("ZZQ-801");
		await expect(dialog.locator("#deleteSigLead")).toContainText("Perimeter");
		await expect(dialog.locator("#deleteSigList")).toBeHidden();
		await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
		await dialog.getByRole("button", { name: "Delete" }).click();
		await expect(dialog).toBeHidden();
		await page.waitForFunction(() => !Object.values((tripwire.client && tripwire.client.signatures) || {}).some(s => /zzq801/i.test(s.signatureID || "")), null, { timeout: 15000 });
	});

	test("several signatures: a count in the title and a chip per signature", async ({ page, context }) => {
		await pasteSigs(page, context, ["ZZQ-802\tCosmic Signature\tRelic Site\tE2E a\t100.0%\t1.00 AU", "ZZQ-803\tCosmic Signature\tGas Site\tE2E b\t100.0%\t2.00 AU"]);
		await row(page, "ZZQ-802").click();
		await row(page, "ZZQ-803").click({ modifiers: [process.platform === "darwin" ? "Meta" : "Control"] });
		await page.click("#delete-signature");
		const dialog = page.locator(".ui-dialog:visible");
		await expect(dialog.locator(".ui-dialog-title")).toHaveText(/Delete 2 signatures/i);
		await expect(dialog.locator("#deleteSigList li")).toHaveCount(2);
		await expect(dialog.locator("#deleteSigList")).toContainText("ZZQ-802");
		await expect(dialog.locator("#deleteSigList")).toContainText("ZZQ-803");
		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden();
	});
});

// Life and mass as the EVE client says them: a wormhole walks down the
// ladder through the inline editor, the table follows, and the dialog
// reopens on the state the expiry implies.
test.describe("wormhole life and mass ladder", () => {
	const PREFIX = "ZZQ-9";
	test.beforeEach(async ({ page }) => { await login(page, "Perimeter"); await removeSigsByPrefix(page, PREFIX); });
	test.afterEach(async ({ page }) => {
		// Wormhole rows are removed through the delete dialog, which knows to take the connection with them.
		await page.evaluate(() => { $("#sigTable tbody tr.selected").removeClass("selected"); $("#sigTable tbody tr").filter((i, tr) => /ZZQ-9/i.test(tr.textContent)).addClass("selected"); }).catch(() => {});
		if (await page.locator("#sigTable tbody tr.selected").count()) {
			await page.click("#delete-signature");
			await page.locator(".ui-dialog:visible").getByRole("button", { name: "Delete" }).click().catch(() => {});
		}
		await removeSigsByPrefix(page, PREFIX).catch(() => {});
	});

	test("inline presets set the expiry, the table reads it back, the dialog reopens on it", async ({ page }) => {
		await page.click("#add-signature");
		await page.locator("#dialog-signature input[name=signatureID_Alpha]").click();
		await page.keyboard.type("ZZQ"); await page.keyboard.type("901");
		await chooseType(page, "Wormhole");
		await page.waitForFunction(() => !$("#dialog-signature #site, #dialog-signature #wormhole").is(":animated"));
		await expect(page.locator("#dialog-signature label[for=wormholeLifeDay]")).toHaveText("<1d");
		await expect(page.locator("#dialog-signature label[for=wormholeMassDestab]")).toHaveText("<50%");
		await page.locator(".ui-dialog:visible").getByRole("button", { name: "Add", exact: true }).click();
		const row = page.locator("#sigTable tbody tr", { hasText: /ZZQ-901/i }).first();
		await expect(row).toBeVisible();
		await expect(row.locator("td").nth(4)).toHaveText("Stable");

		const pick = async (label) => {
			await row.locator("td").nth(4).click();
			await page.locator("#inline-edit .inline-chip", { hasText: label }).click();
			await expect(row.locator("td").nth(4)).toHaveText(label, { timeout: 15000 });
		};
		await pick("<1h");
		const left = await page.evaluate(() => {
			const s = Object.values(tripwire.client.signatures).find(x => /zzq901/i.test(x.signatureID || ""));
			return tripwire.wormholeState.remainingSeconds(s);
		});
		expect(left).toBeGreaterThan(3000);
		expect(left).toBeLessThanOrEqual(3600);

		await pick("Expired");
		await row.click();
		await page.click("#edit-signature");
		await expect(page.locator("#dialog-signature input[name=wormholeLife][value=expired]")).toBeChecked();
		await page.keyboard.press("Escape");

		await row.locator("td").nth(5).click();
		await page.locator("#inline-edit .inline-chip", { hasText: "<10%" }).click();
		await expect(row.locator("td").nth(5)).toHaveText("<10%", { timeout: 15000 });
	});
});
