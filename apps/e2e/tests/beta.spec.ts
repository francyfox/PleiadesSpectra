import { expect } from "@playwright/test";
import { DEMO_URL } from "../demo-url";
import { test } from "./extension";

test("Beta's picture loads on the extension's own page", async ({
	extension,
}) => {
	const page = await extension.openPage("test.html");
	await page.click('[data-action="ask"]');
	const image = page.locator("image.beta__base");
	await expect(image).toHaveAttribute(
		"href",
		`chrome-extension://${extension.id}/beta_plugin.webp`,
	);
	const loaded = await page.evaluate(
		(url) =>
			new Promise<boolean>((resolve) => {
				const probe = new Image();
				probe.onload = () => resolve(probe.naturalWidth > 0);
				probe.onerror = () => resolve(false);
				probe.src = url;
			}),
		`chrome-extension://${extension.id}/beta_plugin.webp`,
	);
	expect(loaded).toBe(true);
});

test("a normal site may load Beta's picture", async ({ extension }) => {
	const page = await extension.context.newPage();
	await page.goto(DEMO_URL);
	const loaded = await page.evaluate(
		(url) =>
			new Promise<boolean>((resolve) => {
				const probe = new Image();
				probe.onload = () => resolve(probe.naturalWidth > 0);
				probe.onerror = () => resolve(false);
				probe.src = url;
			}),
		`chrome-extension://${extension.id}/beta_plugin.webp`,
	);
	expect(loaded).toBe(true);
});

test("a normal site may load the pictures of the poses too", async ({
	extension,
}) => {
	const page = await extension.context.newPage();
	await page.goto(DEMO_URL);
	for (const pose of ["down", "top", "rotate", "blow", "heart"]) {
		const loaded = await page.evaluate(
			(url) =>
				new Promise<boolean>((resolve) => {
					const probe = new Image();
					probe.onload = () => resolve(probe.naturalWidth > 0);
					probe.onerror = () => resolve(false);
					probe.src = url;
				}),
			`chrome-extension://${extension.id}/beta/${pose}.webp`,
		);
		expect(loaded, pose).toBe(true);
	}
});
