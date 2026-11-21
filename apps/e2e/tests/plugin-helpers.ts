import type { Page } from "@playwright/test";
import { type Extension, expect } from "./extension";

/** Installs a script file through the scripts page; the page stays open and is returned. */
export async function installPlugin(
	extension: Extension,
	file: string,
	title: string,
): Promise<Page> {
	const plugins = await extension.openPage("options.html");
	await plugins.setInputFiles("#plugin-file-input", file);
	await expect(plugins.getByRole("heading", { name: title })).toBeVisible();
	await plugins.getByRole("button", { name: "Install" }).click();
	await expect(
		plugins.locator(".plugin strong", { hasText: title }),
	).toBeVisible();
	await plugins.waitForTimeout(600);
	return plugins;
}

/** The profile is shared by the tests, so what a test installed is put back. */
export async function uninstallPlugin(
	plugins: Page,
	title: string,
): Promise<void> {
	await plugins
		.locator(`.plugin:has-text("${title}") [data-action="delete"]`)
		.first()
		.click();
	await expect(
		plugins.locator(".plugin strong", { hasText: title }),
	).toHaveCount(0);
}

/**
 * The address of the page that holds the camera, with the parameters the session was opened with. It is read in the
 * service worker: an extension page opened as a tab would come to the front and take the camera away itself.
 */
export async function cameraPageUrl(
	extension: Extension,
): Promise<string | undefined> {
	const [worker] = extension.context.serviceWorkers();
	return worker
		?.evaluate(async () => {
			const chromeApi = (globalThis as unknown as { chrome: typeof chrome })
				.chrome;
			const contexts = await chromeApi.runtime.getContexts({
				contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType],
			});
			return contexts[0]?.documentUrl;
		})
		.catch(() => undefined);
}
