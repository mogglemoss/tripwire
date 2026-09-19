const { test } = require("@playwright/test");
const { login, expect } = require("./helpers");

// The client sanitiser as the browser actually runs it. The parity test in
// tests/php/ keeps its allow-lists equal to the server's; this checks the
// one behaviour a static comparison cannot: cleaning order.
test("the client sanitiser cleans children before unwrapping a forbidden wrapper", async ({ page }) => {
	await login(page, "Perimeter");
	const out = await page.evaluate(() => sanitiseHtml('<section><img src="/missing" onerror ="alert(1)"></section>'));
	expect(out).toMatch(/^<img /);
	expect(out).not.toMatch(/onerror/i);
	const kept = await page.evaluate(() => sanitiseHtml('<p><strong>Safe</strong> <span style="color: #fff; font-size: 18px; position: fixed">x</span></p>'));
	expect(kept).toContain('style="color: #fff; font-size: 18px"');
	expect(kept).not.toMatch(/position/);
	const empty = await page.evaluate(() => [noteHtmlHasContent("<div><br></div>"), noteHtmlHasContent("<p>note</p>")]);
	expect(empty).toEqual([false, true]);
});

// The server cleans on the way in and refuses an empty note. The save
// response does not carry the body, so it is read back the way every client
// gets notes: a refresh that declares its comment list stale.
test("a hostile note is stored clean, and an empty one is refused", async ({ page }) => {
	await login(page, "Perimeter");
	const post = (url, data) => page.evaluate(([url, data]) => $.ajax({ url: url, type: "POST", data: data, dataType: "JSON" })
		.then((r) => ({ status: 200, body: r }), (xhr) => ({ status: xhr.status, body: xhr.responseJSON })), [url, data]);
	const systemID = await page.evaluate(() => viewingSystemID);

	const saved = await post("comments.php", { mode: "save", systemID: systemID, comment: '<p>ZZQ note</p><section><img src="/missing" onerror ="alert(1)"></section><a href="javascript:alert(2)">x</a>' });
	expect(saved.status).toBe(200);
	expect(saved.body.result).toBe(true);
	try {
		const refresh = await post("refresh.php", { mode: "refresh", systemID: systemID, commentCount: -1, commentTime: "1970-01-01 00:00:00" });
		const stored = (refresh.body.comments || []).find((c) => String(c.id) === String(saved.body.comment.id));
		expect(stored, "the saved note comes back in a refresh").toBeTruthy();
		expect(stored.comment).toContain("ZZQ note");
		expect(stored.comment).not.toMatch(/onerror|javascript:|<section/i);

		const empty = await post("comments.php", { mode: "save", systemID: systemID, comment: "<div><br></div><p>&nbsp;</p>" });
		expect(empty.status).toBe(422);
		expect(empty.body.result).toBe(false);
	} finally {
		await post("comments.php", { mode: "delete", commentID: saved.body.comment.id });
	}
});
