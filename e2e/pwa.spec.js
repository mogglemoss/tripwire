// Installability: the manifest is served as a manifest, the icons exist, and
// the service worker registers in a real Chromium. The in-app browser pane
// cannot register service workers, so this is the check that counts.
const { test, expect } = require("@playwright/test");

test("manifest, icons and service worker are in place", async ({ page, request }) => {
	const manifest = await request.get("/manifest.php");
	expect(manifest.status()).toBe(200);
	expect(manifest.headers()["content-type"]).toContain("application/manifest+json");
	const m = await manifest.json();
	expect(m.short_name).toBe("Tripwire");
	for (const icon of m.icons) {
		const r = await request.get(icon.src);
		expect(r.status(), icon.src).toBe(200);
		expect(r.headers()["content-type"]).toContain("image/png");
	}

	const sw = await request.get("/sw.js");
	expect(sw.status()).toBe(200);
	expect(sw.headers()["cache-control"] || "").not.toContain("immutable");

	await page.goto("/?system=Perimeter");
	expect(await page.locator('link[rel="manifest"]').getAttribute("href")).toBe("/manifest.php");
	const reg = await page.evaluate(async () => {
		const r = await navigator.serviceWorker.register("/sw.js");
		await navigator.serviceWorker.ready;
		return { scope: r.scope, active: !!r.active };
	});
	expect(reg.active).toBe(true);
	expect(reg.scope).toMatch(/\/$/);
});
