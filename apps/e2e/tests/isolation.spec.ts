import { resolve } from "node:path";
import { DEMO_URL } from "../demo-url";
import { expect, test } from "./extension";
import {
	cameraPageUrl,
	installPlugin,
	uninstallPlugin,
} from "./plugin-helpers";

const PINWHEEL = resolve(
	import.meta.dirname,
	"../../../example/scripts/breathing-pinwheel.js",
);
const SCROLL = resolve(
	import.meta.dirname,
	"../../../example/scripts/scroll-page.js",
);
const RATING = resolve(
	import.meta.dirname,
	"../../../example/scripts/rate-our-service.js",
);

test("a script that reads signals changes nothing for a question that opens the camera itself, and the camera of the script on its own page is the only one that gets them", async ({
	extension,
}) => {
	const rating = await installPlugin(extension, RATING, "Rate our service");
	await installPlugin(extension, PINWHEEL, "Breathing pinwheel");
	try {
		const blog = await extension.context.newPage();
		await blog.goto(`${DEMO_URL}/`);
		await blog.getByRole("button", { name: "Rate us" }).click();
		await expect(blog.getByText("How was our service?")).toBeVisible({
			timeout: 15_000,
		});
		await expect
			.poll(() => cameraPageUrl(extension), { timeout: 10_000 })
			.toBeDefined();
		expect(await cameraPageUrl(extension)).not.toContain("signals=");
		await blog.getByRole("button", { name: "5 · Great" }).click();
		await expect.poll(() => cameraPageUrl(extension)).toBeUndefined();

		await blog.goto(`${DEMO_URL}/breathe`);
		await expect
			.poll(() => cameraPageUrl(extension), { timeout: 10_000 })
			.toContain("signals=breathing");
	} finally {
		await uninstallPlugin(rating, "Rate our service");
		await uninstallPlugin(rating, "Breathing pinwheel");
	}
});

test("a question is asked and answered while the camera is held for another script on the same page", async ({
	extension,
}) => {
	const plugins = await installPlugin(extension, RATING, "Rate our service");
	await installPlugin(extension, SCROLL, "Navigate the page with your head");
	try {
		const blog = await extension.context.newPage();
		await blog.goto(`${DEMO_URL}/`);
		await expect
			.poll(() => cameraPageUrl(extension), { timeout: 10_000 })
			.toContain("offscreen.html");

		await blog.getByRole("button", { name: "Rate us" }).click();
		await expect(blog.getByText("How was our service?")).toBeVisible({
			timeout: 15_000,
		});
		await blog.getByRole("button", { name: "5 · Great" }).click();
		await expect(blog.locator("#result")).toHaveText(
			"Thanks! You rated us 5 of 5.",
		);
	} finally {
		await uninstallPlugin(plugins, "Rate our service");
		await uninstallPlugin(plugins, "Navigate the page with your head");
	}
});
