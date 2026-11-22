// The route engine in the real page: the gate map, the live chain and the
// preferences, planned in the browser. The model's own cases run as unit
// tests (app/js-test/routeEngine.test.js); this proves the page has the
// engine, that its graph is built from what the page actually holds, and
// that nothing here writes to the map.
const { test } = require("@playwright/test");
const { login, expect } = require("./helpers");

test.describe("route engine", () => {
	test.use({ serviceWorkers: "block" });

	test("plans across gates and the chain, and honours the preferences", async ({ page }) => {
		const posts = [];
		page.on("request", r => { if (r.method() === "POST" && /refresh\.php/.test(r.url()) && /signatures%5B|signatures\[/.test(r.postData() || "")) { posts.push(r.url()); } });
		await login(page, "Perimeter");

		const out = await page.evaluate(() => {
			const idOf = n => Number(Object.keys(appData.systems).find(k => appData.systems[k].name === n));
			const JITA = idOf("Jita"), AMARR = idOf("Amarr");
			const J = Number(Object.keys(appData.systems).find(k => appData.systems[k].class === 3));
			const empty = { signatures: {}, wormholes: {}, scoutLinks: [] };
			const gates = tripwire.route.plan(JITA, AMARR, {}, empty);
			const old = guidance.findShortestPath(tripwire.map.shortest, JITA, AMARR);
			const chain = Object.assign({}, empty, {
				signatures: { 1: { systemID: JITA, signatureID: "abc123" }, 2: { systemID: J, signatureID: "def456" }, 3: { systemID: J, signatureID: "ghi789" }, 4: { systemID: AMARR, signatureID: "jkl012" } },
				wormholes: { 10: { id: 10, initialID: 1, secondaryID: 2, type: "B274", life: "stable", mass: "stable" }, 11: { id: 11, initialID: 3, secondaryID: 4, type: "????", life: "critical", mass: "stable" } }
			});
			const live = tripwire.route.holes();
			return {
				gateJumps: gates.jumps, oldJumps: old.length - 1, allGates: gates.gates === gates.jumps,
				viaChain: tripwire.route.plan(JITA, AMARR, {}, chain).path.length,
				skipEol: tripwire.route.plan(JITA, AMARR, { skipEol: true }, chain).jumps,
				safer: tripwire.route.plan(JITA, AMARR, { mode: "safer" }, empty),
				liveRows: Object.keys(tripwire.client.wormholes || {}).length, liveHoles: live.length,
				liveSame: tripwire.route.plan(JITA, JITA, {}).jumps
			};
		});

		expect(out.gateJumps).toBe(out.oldJumps);          // agrees with the gate pathfinder the page already has
		expect(out.allGates).toBe(true);
		expect(out.viaChain).toBe(3);                      // Jita, the J-system, Amarr
		expect(out.skipEol).toBe(out.gateJumps);           // the end-of-life hole is left out
		expect(out.safer.jumps).toBeGreaterThanOrEqual(out.gateJumps);
		expect(out.safer.steps.every(s => s.band === "high")).toBe(true);   // Jita to Amarr has an all-high-sec way
		expect(out.liveHoles).toBeLessThanOrEqual(out.liveRows);            // built from the page's own chain
		expect(out.liveSame).toBe(0);
		expect(posts).toEqual([]);                         // planning a route writes nothing
	});
});
