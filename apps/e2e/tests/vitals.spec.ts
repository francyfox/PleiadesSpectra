import { resolve } from "node:path";
import { DEMO_URL } from "../demo-url";
import { type Extension, expect, test } from "./extension";

function pluginPath(fileName: string): string {
	return resolve(import.meta.dirname, `../../../example/scripts/${fileName}`);
}

/** The same steps a user takes: drop the file on the Scripts page and press Install. */
async function installPlugin(
	extension: Extension,
	fileName: string,
	pluginName: string,
) {
	const plugins = await extension.openPage("options.html");
	await plugins.setInputFiles("#plugin-file-input", pluginPath(fileName));
	await expect(
		plugins.getByRole("heading", { name: pluginName }),
	).toBeVisible();
	return plugins;
}

/** A page that loads before the script is registered as a user script is not touched, so the test waits for the list and a moment more. */
async function confirmInstall(
	plugins: Awaited<ReturnType<typeof installPlugin>>,
	pluginName: string,
) {
	await plugins.getByRole("button", { name: "Install" }).click();
	await expect(
		plugins.locator(".plugin strong", { hasText: pluginName }),
	).toBeVisible();
	await plugins.waitForTimeout(800);
}

test("the install window of the heart rate script lists the pulse and says it is not a medical reading", async ({
	extension,
}) => {
	const plugins = await installPlugin(extension, "heart-rate.js", "Heart rate");

	await expect(plugins.getByText("Pulse").first()).toBeVisible();
	await expect(
		plugins.getByText(/not a medical reading/i).first(),
	).toBeVisible();
});

test("the heart rate script shows Beta on the black sleep screen without a question, and not on other pages", async ({
	extension,
}) => {
	const plugins = await installPlugin(extension, "heart-rate.js", "Heart rate");
	await confirmInstall(plugins, "Heart rate");

	const other = await extension.context.newPage();
	await other.goto(`${DEMO_URL}/`);
	await other.waitForTimeout(1500);
	await expect(other.locator(".beta")).toBeHidden();

	const sleep = await extension.context.newPage();
	await sleep.goto(`${DEMO_URL}/sleep`);

	await expect(sleep.locator(".beta")).toBeVisible({ timeout: 15_000 });
	await expect(sleep.locator(".beta-label")).toHaveText("measuring…");
	await expect(sleep.getByText("How was our service?")).toBeHidden();
	await expect(sleep.locator(".beta__face")).toHaveCSS("width", "260px");
});
