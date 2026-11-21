import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { DEMO_URL } from "../demo-url";
import { type Extension, expect, test } from "./extension";

const RATING = resolve(
	import.meta.dirname,
	"../../../example/scripts/rate-our-service.js",
);
const SCRATCH_DIR =
	"/tmp/claude-1000/-home-fox-WebstormProjects-PleiadesSpectra/df5a1e50-0083-49ea-861d-4c47b1fbec8d/scratchpad";
const FIRST_QUESTION = "How was our service?";
const SECOND_QUESTION = "And how was our delivery?";

/** A copy of the rating script with its own name, trigger id and question. */
function writeSecondPlugin(): string {
	const source = readFileSync(RATING, "utf8");
	const copy = source
		.replace("@name        Rate our service", "@name        Rate our delivery")
		.replace('reaction("rate-our-service")', 'reaction("rate-our-delivery")')
		.replace(FIRST_QUESTION, SECOND_QUESTION);
	if (
		copy.includes("Rate our service") ||
		!copy.includes("rate-our-delivery") ||
		!copy.includes(SECOND_QUESTION)
	)
		throw new Error("The copy of the rating script was not changed");
	mkdirSync(SCRATCH_DIR, { recursive: true });
	const file = resolve(SCRATCH_DIR, "rate-our-delivery.js");
	writeFileSync(file, copy);
	return file;
}

async function install(extension: Extension, file: string, title: string) {
	const plugins = await extension.openPage("options.html");
	await plugins.setInputFiles("#plugin-file-input", file);
	await expect(plugins.getByRole("heading", { name: title })).toBeVisible();
	await plugins.getByRole("button", { name: "Install" }).click();
	await expect(
		plugins.locator(".plugin strong", { hasText: title }),
	).toBeVisible();
	return plugins;
}

async function uninstall(plugins: Page, title: string) {
	await plugins
		.locator(`.plugin:has-text("${title}") [data-action="delete"]`)
		.first()
		.click();
	await expect(
		plugins.locator(".plugin strong", { hasText: title }),
	).toHaveCount(0);
}

test("two scripts that ask on one page are asked one after another, and both get an answer", async ({
	extension,
}) => {
	const plugins = await install(extension, RATING, "Rate our service");
	await install(extension, writeSecondPlugin(), "Rate our delivery");
	try {
		const blog = await extension.context.newPage();
		await blog.goto(`${DEMO_URL}/`);
		await blog.getByRole("button", { name: "Rate us" }).click();

		const first = blog.getByText(FIRST_QUESTION);
		const second = blog.getByText(SECOND_QUESTION);
		await expect(first.or(second)).toBeVisible({ timeout: 15_000 });
		const firstShownIsRating = await first.isVisible();
		await expect(firstShownIsRating ? second : first).toBeHidden();

		await blog
			.getByRole("button", { name: "5 · Great" })
			.dispatchEvent("click");

		await expect(firstShownIsRating ? second : first).toBeVisible({
			timeout: 15_000,
		});
		await blog.getByRole("button", { name: "4 · Good" }).dispatchEvent("click");
		await expect(blog.locator("#result")).toContainText("Thanks! You rated us");
	} finally {
		await uninstall(plugins, "Rate our service");
		await uninstall(plugins, "Rate our delivery");
	}
});
