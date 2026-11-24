// The four chain layouts place our cards without any two overlapping. The
// three canvas layouts (tree top, tree left, radial) measure each card to
// space their grid and rings; measured outside the chain panel the card came
// out as upstream's 5em pill and the real cards piled onto each other.
const { test } = require("@playwright/test");
const { login, expect } = require("./helpers");

const LAYOUTS = ["orgChartTop", "orgChartSide", "radial", "orgChart"];

// Visible cards on the chain map and how many pairs of them overlap.
async function cardsAndOverlaps(page) {
	return page.evaluate(() => {
		const cards = [...document.querySelectorAll("#chainMap div.node")].map(n => n.getBoundingClientRect())
			.filter(r => r.width && r.height);
		let overlaps = 0;
		for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
			const a = cards[i], b = cards[j];
			if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps++;
		}
		return { cards: cards.length, overlaps, widths: cards.map(r => Math.round(r.width)),
			shape: cards.map(r => [r.left, r.top, r.width, r.height].map(Math.round).join(",")).join(" ") };
	});
}

// Measure once the map has stopped moving: a poll can redraw the chain
// between our redraw and the measurement, which a fixed wait cannot rule out.
async function settled(page) {
	let last = await cardsAndOverlaps(page);
	for (let i = 0; i < 20; i++) {
		await page.waitForTimeout(500);
		const now = await cardsAndOverlaps(page);
		if (now.cards && now.shape === last.shape) { return now; }
		last = now;
	}
	return last;
}

test("every chain layout places the cards clear of each other", async ({ page }) => {
	await login(page, "Perimeter");
	// The map itself, not the lone root drawn before it arrives.
	await page.waitForFunction(() => chain.data.rawMap, null, { timeout: 15000 });
	const original = await page.evaluate(() => options.chain.renderer);
	try {
		const seen = {};
		for (const layout of LAYOUTS) {
			await page.evaluate((r) => { options.chain.renderer = r; chain.useRenderer(r); chain.redraw(); }, layout);
			seen[layout] = await settled(page);
			// If this ever fails again, the measurements say why.
			await test.info().attach(layout + ".json", { body: JSON.stringify({ cards: seen[layout].cards, overlaps: seen[layout].overlaps, widths: seen[layout].widths }), contentType: "application/json" });
			expect(seen[layout].overlaps, layout + " overlaps").toBe(0);
		}
		// Same cards in every layout: nothing measured in secret is left on the map
		const counts = new Set(LAYOUTS.map(l => seen[l].cards));
		expect([...counts], "card count per layout").toHaveLength(1);
		// A card on the canvas layouts is sized as it is on the classic tree, not shrunk to its minimum
		for (const layout of LAYOUTS.slice(0, 3)) {
			expect(Math.max(...seen[layout].widths), layout + " widest card").toBeGreaterThanOrEqual(Math.max(...seen.orgChart.widths) - 2);
		}
		test.info().annotations.push({ type: "cards on the map", description: String(seen.orgChart.cards) });
	} finally {
		await page.evaluate((r) => { options.chain.renderer = r; chain.useRenderer(r); chain.redraw(); }, original);
	}
});

// Made-up chains, so this does not depend on what is on the map: a root with
// one to eight holes, some or all of which lead on. A card straight out from
// its parent is the tight case, and where it points changes with the count.
test("no card lies on another, whichever way its branch points", async ({ page }) => {
	await login(page, "Perimeter");
	await page.waitForFunction(() => chain.data.rawMap, null, { timeout: 15000 });
	const bad = await page.evaluate((layouts) => {
		const was = { signatures: tripwire.client.signatures, wormholes: tripwire.client.wormholes, map: $.extend(true, {}, chain.data.rawMap), renderer: options.chain.renderer };
		const tab = $("#chainTabs .current .name"), wasTab = tab.data("tab"), wasViewing = viewingSystemID;
		const J = Object.keys(appData.systems).filter(id => appData.systems[id].class === 3).map(Number), out = [];
		try {
			for (let holes = 1; holes <= 8; holes++) for (const onward of [0, 1, 2, 3]) for (const which of ["all", "last", "first"]) {
				const signatures = {}, wormholes = {}; let sig = 1, next = 1;
				const join = (a, b) => { signatures[sig] = { id: sig, systemID: a, signatureID: "aaa" + (100 + sig), type: "wormhole", name: "" }; signatures[sig + 1] = { id: sig + 1, systemID: b, signatureID: "bbb" + (100 + sig), type: "wormhole", name: "" }; wormholes[sig] = { id: sig, initialID: sig, secondaryID: sig + 1, type: "H296", parent: "initial", life: "stable", mass: "stable" }; sig += 2; };
				const kids = Array.from({ length: holes }, () => J[next++]);
				kids.forEach(k => join(J[0], k));
				kids.forEach((k, i) => { if (which === "all" || (which === "last" ? i === holes - 1 : i === 0)) { for (let g = 0; g < onward; g++) { join(k, J[next++]); } } });
				tripwire.client.signatures = signatures; tripwire.client.wormholes = wormholes;
				tab.data("tab", String(J[0])); viewingSystemID = J[0];
				for (const layout of layouts) {
					options.chain.renderer = layout; chain.useRenderer(layout);
					chain.draw({ map: $.extend(true, {}, wormholes) });
					const r = [...document.querySelectorAll("#chainMap div.node")].map(n => n.getBoundingClientRect()).filter(x => x.width && x.height);
					let overlaps = 0;
					for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) { const a = r[i], b = r[j]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps++; }
					if (overlaps || r.length < sig / 2) { out.push([layout, holes, onward, which, r.length + " cards", overlaps + " overlaps"].join(" ")); }
				}
			}
		} finally {
			tripwire.client.signatures = was.signatures; tripwire.client.wormholes = was.wormholes;
			tab.data("tab", wasTab); viewingSystemID = wasViewing;
			options.chain.renderer = was.renderer; chain.useRenderer(was.renderer); chain.draw({ map: was.map });
		}
		return out;
	}, LAYOUTS.slice(0, 3));
	expect(bad).toEqual([]);
});

// The first draw waits for the charts to load. A poll that lands meanwhile
// says who is where and carries no map; it used to take the waiting draw's
// place, and the chain stayed blank until someone changed a signature.
test("a draw that has to wait is not lost to the next one", async ({ page }) => {
	await login(page, "Perimeter");
	await page.waitForFunction(() => chain.data.rawMap, null, { timeout: 15000 });
	const seen = await page.evaluate(async () => {
		const real = chain.renderer, drawn = [], keep = $.extend(true, {}, chain.data.rawMap), sleep = ms => new Promise(r => setTimeout(r, ms));
		let ready = false;
		const size = () => Object.keys(chain.data.rawMap || {}).length;
		// Three maps that can be told apart by their size.
		const some = n => { const o = {}; Object.keys(keep).slice(0, n).forEach(k => { o[k] = $.extend(true, {}, keep[k]); }); return o; };
		chain.renderer = { ready: () => ready, switchTo() {}, switchFrom() {}, draw: map => drawn.push(map.rows.length) };
		const useRenderer = chain.useRenderer; chain.useRenderer = () => {};
		const out = { maps: Object.keys(keep).length };
		try {
			chain.data.rawMap = undefined;
			chain.draw({ map: some(3), occupied: null, flares: null });
			chain.draw({ map: null, occupied: [], flares: null });          // the poll
			await sleep(250); ready = true; await sleep(250);
			out.poll = size();
			ready = false;
			chain.draw({ map: some(2) });
			chain.redraw();                                                 // what is drawn now is older than what waits
			await sleep(250); ready = true; await sleep(250);
			out.redraw = size();
			ready = false;
			chain.draw({ map: some(3) });
			chain.draw({ map: some(1) });                                   // and a newer map still wins
			await sleep(250); ready = true; await sleep(250);
			out.newer = size();
			const n = drawn.length; await sleep(400);
			out.settled = drawn.length === n;                               // nothing left going round
		} finally { chain.renderer = real; chain.useRenderer = useRenderer; chain.draw({ map: keep }); }
		return out;
	});
	test.skip(seen.maps < 3, "needs a map with three connections");
	expect(seen).toEqual({ maps: seen.maps, poll: 3, redraw: 2, newer: 1, settled: true });
});
