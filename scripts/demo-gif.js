// Build the README demo GIF: a walk through the app on the template pack and
// the neutral default. Frames are screenshots from a signed-in Playwright
// session (e2e/.auth/state.json, from `npm run e2e` once); assembly is PIL.
//
//   node scripts/demo-gif.js <frames-dir>            then: python3 scripts/demo-gif.py <frames-dir> docs/demo.gif
//
// Base URL from E2E_BASE_URL (default http://localhost:8080); the server must
// have BRAND_SWITCH on so the ?brand cookie can pick packs.
const { chromium } = require("@playwright/test");
const fs = require("fs");
const OUT = process.argv[2];
const BASE = process.env.E2E_BASE_URL || "http://localhost:8080";
const SYSTEM = process.env.DEMO_SYSTEM || "Sobaseki";
const MASK = process.env.DEMO_MASK || "";           // e.g. "Corp": switch the session to that mask first
let n = 0;
const shot = async (page, hold) => { n++; const f = `${OUT}/${String(n).padStart(3, "0")}-${hold}.png`; await page.screenshot({ path: f }); };

async function ready(page) {
	await page.waitForFunction(() => window.tripwire && window.tripwire.client && window.tripwire.client.signatures !== undefined, null, { timeout: 30000 });
	await page.waitForTimeout(1500);
	if (MASK) {
		const cur = await page.evaluate(() => $("#mask .mask").text().trim());
		if (cur !== MASK) {
			const id = await page.evaluate(l => ([...document.querySelectorAll("#mask-menu-mask-list a .mask")].find(m => m.textContent.trim() === l) || {}).dataset?.mask, MASK);
			if (id) { await page.evaluate(m => maskFunctions.updateActiveMask(m, () => {}), id); await page.waitForTimeout(6000); }
		}
	}
	await page.evaluate(() => tripwire.systemChange(viewingSystemID));
	await page.waitForFunction(() => document.querySelectorAll("#chainMap .node").length > 0, null, { timeout: 15000 }).catch(() => {});
	await page.waitForTimeout(1500);
}

(async () => {
	fs.mkdirSync(OUT, { recursive: true });
	const browser = await chromium.launch();
	const packs = (process.env.DEMO_PACKS || "example,tripwire").split(",");   // DEMO_PACKS=mycorp for a corp's own
	for (const slug of packs) {
		const cookie = { name: "tripwire_brand", value: slug, url: BASE };
		// sign-in page
		let ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: "dark" });
		await ctx.addCookies([cookie]); let page = await ctx.newPage();
		await page.goto(BASE + "/", { waitUntil: "networkidle" }); await page.waitForTimeout(500);
		await shot(page, 1800); await ctx.close();

		ctx = await browser.newContext({ storageState: "e2e/.auth/state.json", viewport: { width: 1280, height: 800 }, colorScheme: "dark" });
		await ctx.addCookies([cookie]); page = await ctx.newPage();
		await page.goto(BASE + "/?system=" + SYSTEM); await ready(page);
		await shot(page, 2200);                                   // the desk

		const row = page.locator("#sigTable tbody tr").first();  // a signature, opened
		if (await row.count()) {
			await row.locator("td").first().click(); await page.waitForTimeout(300);
			await page.locator("#edit-signature").click(); await page.waitForTimeout(800);
			await shot(page, 2200);
			await page.evaluate(() => { const d = $("#dialog-signature"); if (d.hasClass("ui-dialog-content")) d.dialog("close"); });
			await page.waitForTimeout(300);
		}
		await page.locator("#theme-toggle").click(); await page.waitForTimeout(700);   // the light room
		await shot(page, 2200);
		await page.locator("#settings").click(); await page.waitForTimeout(800);        // settings
		await shot(page, 1800);
		await ctx.close();
	}
	await browser.close();
	console.log("frames:", n);
})();
