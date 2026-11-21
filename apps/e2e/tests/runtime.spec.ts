import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const runtimeSource = readFileSync(
	new URL("../../../packages/reactions/dist/runtime.js", import.meta.url),
	"utf8",
);
const pluginSource = readFileSync(
	new URL("../../../example/scripts/rate-our-service.js", import.meta.url),
	"utf8",
);

declare global {
	interface Window {
		asked: unknown[];
	}
}

test("the rating script runs in a real page: nothing while the modal is hidden, then it fills and submits the form", async ({
	page,
}) => {
	await page.addInitScript(() => {
		window.asked = [];
		Object.defineProperty(window, "chrome", {
			configurable: true,
			value: {
				runtime: {
					sendMessage: async (message: unknown) => {
						window.asked.push(message);
						return "smile";
					},
				},
			},
		});
	});
	await page.goto("/");
	await page.addScriptTag({ content: runtimeSource });
	await page.addScriptTag({ content: pluginSource });
	await page.waitForTimeout(500);
	expect(await page.evaluate(() => window.asked.length)).toBe(0);

	await page.click("#open-rating");

	await expect(page.locator("#result")).toHaveText(
		"Thanks! You rated us 5 of 5.",
	);
	expect(await page.evaluate(() => window.asked.length)).toBe(1);
});
