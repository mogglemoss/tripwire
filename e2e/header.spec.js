// Header toggles: what you click must change, visibly, and stay changed.
const { test, expect } = require("@playwright/test");
const { login } = require("./helpers");

async function ready(page) {
	await page.goto("/?system=Perimeter");
	await page.waitForFunction(() => window.tripwire && window.options && window.options.buttons);
	await page.waitForSelector("#follow", { state: "visible" });
}

test("follow-my-system toggles on click, shows it, and survives a reload", async ({ page }) => {
	await ready(page);
	const follow = page.locator("#follow");
	const state = () => page.evaluate(() => ({
		active: document.getElementById("follow").classList.contains("active"),
		option: !!options.buttons.follow,
		color: getComputedStyle(document.getElementById("follow")).color,
		primary: getComputedStyle(document.documentElement).getPropertyValue("--primary").trim(),
	}));
	const before = await state();

	await follow.click();
	const after = await state();
	expect(after.active).toBe(!before.active);
	expect(after.option).toBe(after.active);

	// On draws in the brand orange; off in the muted grey. Whichever way we
	// just went, the two states must not look the same.
	expect(after.color).not.toBe(before.color);
	const onColor = after.active ? after.color : before.color;
	const rgb = await page.evaluate(p => { const d = document.createElement("div"); d.style.color = p; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; }, after.primary);
	expect(onColor).toBe(rgb);

	// Persisted: the options sync writes it, a reload reads it back.
	await page.waitForTimeout(1500);
	await ready(page);
	expect((await state()).active).toBe(after.active);

	// Leave the account as we found it.
	await follow.click();
	await page.waitForTimeout(1500);
	expect((await state()).active).toBe(before.active);
});

// The header system picker: Escape closes it, and picking a suggestion goes
// there without a second Enter (ported from squizzlabs/tripwire b0fef1b).
test.describe("system picker", () => {
	test("Escape closes the picker", async ({ page }) => {
		await login(page, "Perimeter");
		await page.click("#search");
		const input = page.locator("#searchSpan input.systemsAutocomplete");
		await expect(input).toBeVisible();
		await expect(input).toBeFocused();
		await page.keyboard.press("Escape");
		await expect(page.locator("#searchSpan")).toBeHidden();
		await expect(page.locator("#search")).not.toHaveClass(/active/);
	});

	test("choosing a suggestion opens that system", async ({ page }) => {
		await login(page, "Perimeter");
		await page.click("#search");
		const input = page.locator("#searchSpan input.systemsAutocomplete");
		await input.fill("Jita");
		await expect(page.locator("ul.ui-autocomplete li.ui-menu-item").first()).toBeVisible();
		await Promise.all([
			page.waitForURL(/system=Jita/),
			page.keyboard.press("ArrowDown").then(() => page.keyboard.press("Enter"))
		]);
		await expect(page).toHaveURL(/system=Jita/);
	});

	test("the auto-mapper button is a toggle like the others", async ({ page }) => {
		await login(page, "Perimeter");
		await expect(page.locator("#toggle-automapper")).toHaveClass(/bar-toggle/);
	});
});

// The account is anchored at the right: mask, name, then the avatar in the
// corner; the controls sit to its left. The theme lives beside EVE time and
// in Settings > Display.
test.describe("header layout", () => {
	for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
		test(`the avatar is rightmost and the controls come first at ${viewport.width}px`, async ({ page }) => {
			await page.setViewportSize(viewport);
			await login(page, "Perimeter");
			const box = async (sel) => page.locator(sel).boundingBox();
			const avatar = await box("#user-avatar"), mask = await box("#mask-menu-link"), cog = await box("#settings"), squelch = await box("#voice-toggle");
			const rightmost = await page.evaluate(() => Math.max(...[...document.querySelectorAll("#topbar .hdr-right *")].filter(e => e.offsetParent && e.getBoundingClientRect().width).map(e => e.getBoundingClientRect().right)));
			expect(Math.round(avatar.x + avatar.width)).toBe(Math.round(rightmost));
			expect(mask.x).toBeLessThan(avatar.x);
			expect(cog.x).toBeLessThan(mask.x);
			expect(squelch.x).toBeLessThan(cog.x);
		});
	}

	test("the mask menu opens under its capsule", async ({ page }) => {
		await login(page, "Perimeter");
		await page.click("#mask-menu-link");
		const pill = await page.locator("#mask-menu-link").boundingBox(), menu = await page.locator("#mask-menu").boundingBox();
		expect(Math.abs((pill.x + pill.width) - (menu.x + menu.width))).toBeLessThanOrEqual(1);
		expect(menu.y).toBeGreaterThan(pill.y + pill.height - 1);
	});

	test("the theme: beside EVE time, and in Settings > Display", async ({ page }) => {
		await login(page, "Perimeter");
		await expect(page.locator("#statusbar #theme-toggle")).toBeVisible();
		await expect(page.locator("#topbar #theme-toggle")).toHaveCount(0);
		const before = await page.evaluate(() => themeToggle.effective());
		await page.click("#statusbar #theme-toggle");
		expect(await page.evaluate(() => themeToggle.effective())).not.toBe(before);
		await page.click("#settings");
		await page.click("#optionsAccordion [role=tab][data-tab=display]");
		await page.click("label[for=room-auto]");
		expect(await page.evaluate(() => document.documentElement.hasAttribute("data-theme"))).toBe(false);
		await page.click("label[for=room-light]");
		expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("light");
		await page.click("label[for=room-auto]");   // leave it following the device
	});
});
