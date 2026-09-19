const { test } = require("@playwright/test");
const { login, expect } = require("./helpers");

// Density follows the panel's own width. The window is the only way to
// change a panel's width today, so these use it; the class on the panel is
// what the styles key on, and the label visibility is what the user sees.
test("bar labels give way by panel width, and the page marks itself measured", async ({ page }) => {
	await page.setViewportSize({ width: 1920, height: 1000 });
	await login(page, "Perimeter");
	await expect(page.locator("html")).toHaveClass(/panels-measured/);
	const sigs = page.locator("#signaturesWidget");
	const label = page.locator("#signaturesWidget .bar-btn:not(.bar-primary) .bar-label").first();
	await expect(sigs).not.toHaveClass(/panel-compact/);
	await expect(label).toBeVisible();

	await page.setViewportSize({ width: 1400, height: 1000 });
	await expect(sigs).toHaveClass(/panel-compact/);
	await expect(label).toBeHidden();
	await expect(page.locator("#infoWidget")).toHaveClass(/panel-compact/);

	await page.setViewportSize({ width: 1000, height: 1000 });
	await expect(page.locator("#infoWidget")).toHaveClass(/panel-narrow/);
	await expect(page.locator("#sys-range")).toBeHidden();

	await page.setViewportSize({ width: 1920, height: 1000 });
	await expect(sigs).not.toHaveClass(/panel-compact/);
	await expect(label).toBeVisible();
});

// Dragging a divider sets a size that wins until reset. Widths are checked
// on the panels themselves; the divider must stay under the pointer; the
// preference must survive a reload; and reset must put the defaults back.
test.describe("resizable panels", () => {
	async function widths(page) {
		return page.evaluate(() => ({
			info: Math.round(document.getElementById("infoWidget").getBoundingClientRect().width),
			sigs: Math.round(document.getElementById("signaturesWidget").getBoundingClientRect().width),
			notes: Math.round(document.getElementById("notesWidget").getBoundingClientRect().width),
			top: Math.round(document.getElementById("infoWidget").getBoundingClientRect().height)
		}));
	}
	async function resetAndWait(page) {
		await page.evaluate(() => tripwire.panelLayout.reset());
		await page.waitForFunction(() => !tripwire.panelLayout.hasColumnPreference() && !tripwire.panelLayout.hasRowPreference());
		await page.waitForTimeout(700);
	}
	test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1600, height: 1000 }); await login(page, "Perimeter"); await resetAndWait(page); });
	test.afterEach(async ({ page }) => { await resetAndWait(page).catch(() => {}); });

	test("a column divider moves the pair, leaves the third alone, and stays under the pointer", async ({ page }) => {
		const before = await widths(page);
		const handle = page.locator(".panel-handle-column").first();
		const box = await handle.boundingBox();
		const x = box.x + box.width / 2, y = box.y + box.height / 2;
		await page.mouse.move(x, y);
		await page.mouse.down();
		await page.mouse.move(x + 2, y);         // under the threshold: nothing yet
		expect((await widths(page)).info).toBe(before.info);
		await page.mouse.move(x + 60, y);
		await page.mouse.move(x + 120, y);
		const during = await handle.boundingBox();
		expect(Math.abs((during.x + during.width / 2) - (x + 120))).toBeLessThanOrEqual(3);
		await page.mouse.up();
		const after = await widths(page);
		expect(after.info - before.info).toBeGreaterThanOrEqual(115);
		expect(before.sigs - after.sigs).toBeGreaterThanOrEqual(115);
		expect(Math.abs(after.notes - before.notes)).toBeLessThanOrEqual(2);

		await page.waitForTimeout(900);            // the save is debounced
		await page.reload();
		await page.waitForFunction(() => window.tripwire && tripwire.client && tripwire.timer);
		await page.waitForTimeout(800);
		const reloaded = await widths(page);
		expect(Math.abs(reloaded.info - after.info)).toBeLessThanOrEqual(2);

		await resetAndWait(page);
		const reset = await widths(page);
		expect(Math.abs(reset.info - before.info)).toBeLessThanOrEqual(2);
	});

	test("the row divider sets the top row, and the fit does not take it back on a system change", async ({ page }) => {
		const before = await widths(page);
		const handle = page.locator(".panel-handle-row");
		const box = await handle.boundingBox();
		const x = box.x + box.width / 2, y = box.y + box.height / 2;
		await page.mouse.move(x, y); await page.mouse.down();
		await page.mouse.move(x, y + 40); await page.mouse.move(x, y + 80); await page.mouse.up();
		const after = await widths(page);
		expect(after.top - before.top).toBeGreaterThanOrEqual(75);
		await page.evaluate(() => tripwire.systemChange(30000142));   // Jita: a different panel content
		await page.waitForTimeout(1500);
		expect(Math.abs((await widths(page)).top - after.top)).toBeLessThanOrEqual(2);
	});

	test("arrow keys on a focused divider resize in steps", async ({ page }) => {
		const before = await widths(page);
		await page.locator(".panel-handle-column").first().focus();
		await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
		await page.waitForTimeout(300);
		expect((await widths(page)).info - before.info).toBeGreaterThanOrEqual(30);
	});
});
