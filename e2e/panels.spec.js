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
