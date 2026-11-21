import { expect, type Page } from "@playwright/test";
import { test } from "./extension";

const MARGIN_PX = 16;

async function boxOf(page: Page, selector: string) {
	const box = await page.locator(selector).boundingBox();
	if (!box) throw new Error(`${selector} is not on the page`);
	return box;
}

/** The context is attached over CDP, where Playwright does not know the viewport; fixed elements are placed inside the scrollbars. */
function windowSizeOf(page: Page) {
	return page.evaluate(() => ({
		width: document.documentElement.clientWidth,
		height: document.documentElement.clientHeight,
	}));
}

async function openAskedWidget(extension: {
	openPage(name: string): Promise<Page>;
}) {
	const page = await extension.openPage("test.html");
	await page.click('[data-action="ask"]');
	await expect(page.locator(".beta")).toBeVisible();
	return page;
}

test("Beta stands at the bottom right by default and looks as drawn", async ({
	extension,
}) => {
	const page = await openAskedWidget(extension);
	const viewport = await windowSizeOf(page);

	const beta = await boxOf(page, ".beta");
	expect(Math.round(viewport.width - beta.x - beta.width)).toBe(MARGIN_PX);
	expect(Math.round(viewport.height - beta.y - beta.height)).toBe(MARGIN_PX);
	await expect(page.locator(".beta__face")).toHaveCSS("transform", "none");
});

test("on the left side Beta is turned around and the question card moves away", async ({
	extension,
}) => {
	const page = await openAskedWidget(extension);
	await page.click('[data-action="place:top-left"]');

	const beta = await boxOf(page, ".beta");
	expect(Math.round(beta.x)).toBe(MARGIN_PX);
	expect(Math.round(beta.y)).toBe(MARGIN_PX);
	await expect(page.locator(".beta__face")).toHaveCSS(
		"transform",
		"matrix(-1, 0, 0, 1, 0, 0)",
	);

	const hint = await boxOf(page, ".hint");
	expect(hint.x).toBeGreaterThan(beta.x + beta.width);
});

test("the center place puts Beta in the middle of the window", async ({
	extension,
}) => {
	const page = await openAskedWidget(extension);
	await page.click('[data-action="place:center"]');
	const viewport = await windowSizeOf(page);

	const beta = await boxOf(page, ".beta");
	expect(Math.abs(beta.x + beta.width / 2 - viewport.width / 2)).toBeLessThan(
		2,
	);
	expect(Math.abs(beta.y + beta.height / 2 - viewport.height / 2)).toBeLessThan(
		2,
	);
});

test("a named size and a width in pixels change how big Beta is", async ({
	extension,
}) => {
	const page = await openAskedWidget(extension);

	await page.click('[data-action="size:large"]');
	expect((await boxOf(page, ".beta__face")).width).toBe(260);

	await page.click('[data-action="size:small"]');
	expect((await boxOf(page, ".beta__face")).width).toBe(120);

	/** The bench has buttons for the three names only; a width in pixels is asked with a button of the test's own. */
	await page.evaluate(() => {
		const button = document.createElement("button");
		button.dataset.action = "size:400";
		button.id = "size-400";
		document.querySelector(".bench__card")?.append(button);
	});
	await page.locator("#size-400").dispatchEvent("click");
	expect((await boxOf(page, ".beta__face")).width).toBe(400);
});

test("a head gesture shows its pose and the drawn face comes back, shake turns to both sides", async ({
	extension,
}) => {
	const page = await openAskedWidget(extension);
	const press = (action: string) =>
		page.locator(`[data-action="${action}"]`).dispatchEvent("click");
	const pose = page.locator(".beta__pose");
	const poseImage = page.locator(".beta__pose image");

	await expect(poseImage).toHaveCount(0);
	await press("gesture:tilt-up");
	await expect(poseImage).toHaveAttribute("href", /beta\/top\.webp$/);
	await expect(pose).toHaveCSS("opacity", "1");
	await expect(page.locator(".beta__base")).toHaveCSS("opacity", "0");
	await expect(poseImage).toHaveCount(0, { timeout: 3000 });

	await press("gesture:shake");
	await expect(pose).toHaveCSS("transform", /matrix\(-1/);
	await expect(poseImage).toHaveCount(0, { timeout: 3000 });
	await press("gesture:shake");
	await expect(pose).toHaveCSS("transform", "none");
});

test("breathing makes Beta spin the pinwheel and shows the rate, and nothing of it is in the page before", async ({
	extension,
}) => {
	const page = await openAskedWidget(extension);
	await expect(page.locator(".beta__pinwheel *")).toHaveCount(0);
	await expect(page.locator("animateTransform")).toHaveCount(0);

	await page.locator('[data-action="breathing:12"]').dispatchEvent("click");

	await expect(page.locator(".beta__pose image")).toHaveAttribute(
		"href",
		/beta\/blow\.webp$/,
	);
	await expect(page.locator(".beta__pinwheel animateTransform")).toHaveCount(1);
	await expect(
		page.locator(".beta__pinwheel animateTransform"),
	).toHaveAttribute("dur", "5s");
	await expect(page.locator(".beta__pinwheel .beta__vital-number")).toHaveText(
		"12",
	);
	await expect(page.locator(".beta__pinwheel .beta__vital-unit")).toHaveText(
		"br/m",
	);

	await page.locator('[data-action="breathing:20"]').dispatchEvent("click");

	await expect(
		page.locator(".beta__pinwheel animateTransform"),
	).toHaveAttribute("dur", "3s");
});

test("the pulse shows a beating heart in the fingers and the number beside it, and only then", async ({
	extension,
}) => {
	const page = await openAskedWidget(extension);
	await expect(page.locator(".beta__heart *")).toHaveCount(0);
	await expect(page.locator("animateTransform")).toHaveCount(0);

	await page.locator('[data-action="pulse:120"]').dispatchEvent("click");

	await expect(page.locator(".beta__pose image")).toHaveAttribute(
		"href",
		/beta\/heart\.webp$/,
	);
	await expect(page.locator(".beta__heart .beta__vital-number")).toHaveText(
		"120",
	);
	await expect(page.locator(".beta__heart .beta__vital-unit")).toHaveText(
		"bpm",
	);
	await expect(page.locator(".beta__heart animateTransform")).toHaveAttribute(
		"dur",
		"0.5s",
	);
	await expect(page.locator(".beta__pinwheel *")).toHaveCount(0);
});

test("a shown vital puts Beta on the page without a question, and hide takes her away", async ({
	extension,
}) => {
	const page = await extension.openPage("test.html");
	await expect(page.locator(".beta")).toBeHidden();

	await page.locator('[data-action="show-vital:pulse"]').dispatchEvent("click");
	await expect(page.locator(".beta")).toBeVisible();
	await expect(page.locator(".beta-label")).toHaveText("measuring…");
	await expect(page.locator(".hint")).toBeHidden();

	await page.locator('[data-action="pulse:90"]').dispatchEvent("click");
	await expect(page.locator(".beta__heart .beta__vital-number")).toHaveText(
		"90",
	);

	await page.locator('[data-action="hide-vital"]').dispatchEvent("click");
	await expect(page.locator(".beta")).toBeHidden();
});

test("a question over a shown vital hides with the question, and Beta stays with the vital", async ({
	extension,
}) => {
	const page = await extension.openPage("test.html");
	await page.locator('[data-action="show-vital:pulse"]').dispatchEvent("click");
	await page.locator('[data-action="ask"]').dispatchEvent("click");
	await expect(page.locator(".hint")).toBeVisible();

	await page.locator('[data-action="hide"]').dispatchEvent("click");
	await expect(page.locator(".hint")).toBeHidden();
	await expect(page.locator(".beta")).toBeVisible();
});
