// Settings is one height on every tab, inside the window; taller tabs scroll
// within it. It used to take the first tab's height and run off the bottom.
const { test } = require("@playwright/test");
const { login, expect } = require("./helpers");

for (const viewport of [{ width: 1280, height: 700 }, { width: 390, height: 844 }]) {
	test(`Settings fits the window on every tab at ${viewport.width}x${viewport.height}`, async ({ page }) => {
		await page.setViewportSize(viewport);
		await login(page, "Perimeter");
		await page.click("#settings");
		const dialog = page.locator(".ui-dialog:has(#dialog-options)");
		await expect(dialog).toBeVisible();
		const heights = new Set();
		for (const tab of ["account", "map", "signatures", "display", "voice", "voice+eleven", "stats"]) {
			const tabButton = page.locator(`#optionsAccordion [role=tab][data-tab=${tab.split("+")[0]}]`);
			await tabButton.click();
			await expect(tabButton, tab + " tab reachable").toBeInViewport();
			if (tab === "voice+eleven") { await page.click("label[for=voice-engine-eleven]"); }
			const box = await dialog.boundingBox();
			expect(box.y, tab + " top").toBeGreaterThanOrEqual(0);
			expect(box.y + box.height, tab + " bottom").toBeLessThanOrEqual(viewport.height);
			heights.add(Math.round(box.height));
			await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeInViewport();
		}
		expect([...heights], "one height for every tab").toHaveLength(1);
	});
}
