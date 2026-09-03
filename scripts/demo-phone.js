// Phone screenshots per pack for the README: node scripts/demo-phone.js docs [packs]
const { chromium, devices } = require("@playwright/test");
const OUT = process.argv[2]; const BASE = process.env.E2E_BASE_URL || "http://localhost:8080";
const packs = (process.argv[3] || "tripwire,example").split(","); const MASK = process.env.DEMO_MASK || "";
(async () => {
	const b = await chromium.launch();
	for (const slug of packs) {
		const ctx = await b.newContext({ ...devices["iPhone 13"], storageState: "e2e/.auth/state.json", colorScheme: "dark" });
		await ctx.addCookies([{ name: "tripwire_brand", value: slug, url: BASE }]);
		const p = await ctx.newPage();
		await p.addInitScript(() => { try { localStorage.setItem("tripwire.install.dismissed", "1"); } catch (e) {} });
		await p.goto(BASE + "/?system=" + (process.env.DEMO_SYSTEM || "Sobaseki"));
		await p.waitForFunction(() => window.tripwire && window.tripwire.client && window.tripwire.client.signatures !== undefined, null, { timeout: 30000 });
		await p.waitForTimeout(1500);
		if (MASK) { const cur = await p.evaluate(() => $("#mask .mask").text().trim()); if (cur !== MASK) { const id = await p.evaluate(l => ([...document.querySelectorAll("#mask-menu-mask-list a .mask")].find(m => m.textContent.trim() === l) || {}).dataset?.mask, MASK); if (id) { await p.evaluate(m => maskFunctions.updateActiveMask(m, () => {}), id); await p.waitForTimeout(6000); } } }
		await p.waitForTimeout(1500);
		await p.screenshot({ path: `${OUT}/phone-${slug}.png` });
		await ctx.close(); console.log("done", slug);
	}
	await b.close();
})();
