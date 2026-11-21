import { resolve } from "node:path";
import { DEMO_URL } from "../demo-url";
import { type Extension, expect, test } from "./extension";

const PLUGIN_FILE = resolve(
	import.meta.dirname,
	"../../../example/scripts/rate-our-service.js",
);

/** The same steps a user takes: drop the file on the Scripts page and press Install. */
async function installRatingPlugin(extension: Extension) {
	const plugins = await extension.openPage("options.html");
	await plugins.setInputFiles("#plugin-file-input", PLUGIN_FILE);
	await expect(
		plugins.getByRole("heading", { name: "Rate our service" }),
	).toBeVisible();
	await plugins.getByRole("button", { name: "Install" }).click();
	await expect(
		plugins.locator(".plugin strong", { hasText: "Rate our service" }),
	).toBeVisible();
	return plugins;
}

test("the rating script installs, and the blog's rating form is filled in once its modal opens", async ({
	extension,
}) => {
	await installRatingPlugin(extension);

	const blog = await extension.context.newPage();
	await blog.goto(`${DEMO_URL}/`);
	await blog.getByRole("button", { name: "Rate us" }).click();

	await expect(blog.getByText("How was our service?")).toBeVisible({
		timeout: 15_000,
	});
	await blog.getByRole("button", { name: "5 · Great" }).click();
	await expect(blog.locator("#result")).toHaveText(
		"Thanks! You rated us 5 of 5.",
	);
});

test("nothing is asked while the rating modal stays hidden", async ({
	extension,
}) => {
	await installRatingPlugin(extension);

	const blog = await extension.context.newPage();
	await blog.goto(`${DEMO_URL}/`);
	await blog.waitForTimeout(1500);

	await expect(blog.getByText("How was our service?")).toBeHidden();
});

test("the code of an installed script opens in the dialog, highlighted", async ({
	extension,
}) => {
	const plugins = await installRatingPlugin(extension);

	await plugins.getByTitle("Show code").first().click();

	const code = plugins.locator(".code-dialog__body");
	await expect(code).toContainText("SCORE_BY_GESTURE");
	await expect(code.locator("pre.shiki")).toBeVisible();
});

test("the examples in the help dialog are filled in", async ({ extension }) => {
	const plugins = await extension.openPage("options.html");

	await plugins.getByRole("button", { name: "How to use" }).first().click();
	await plugins.getByRole("tab", { name: "For developers" }).click();

	await expect(plugins.locator(".help__code").first()).toContainText(
		'reaction("like")',
	);
});

test("the help dialog lists what scripts can do and offers requests to copy", async ({
	extension,
}) => {
	const plugins = await extension.openPage("options.html");

	await plugins.getByRole("button", { name: "How to use" }).first().click();
	await plugins.getByRole("tab", { name: "What it can do" }).click();

	const panel = plugins.locator(".help__panel:visible");
	await expect(panel).toContainText("What can start a script");
	await expect(panel).toContainText("A measurement changes");
	await expect(panel.locator(".help__prompt")).toHaveCount(5);
	await expect(
		plugins.getByRole("tab", { name: "For developers" }),
	).toBeVisible();
});
