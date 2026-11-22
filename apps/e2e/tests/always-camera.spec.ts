import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { DEMO_URL } from "../demo-url";
import { type Extension, expect, test } from "./extension";
import {
	cameraPageUrl,
	installPlugin,
	uninstallPlugin,
} from "./plugin-helpers";

const SCROLL = resolve(
	import.meta.dirname,
	"../../../example/scripts/scroll-page.js",
);
const TITLE = "Navigate the page with your head";
/** An address that `@match *://localhost/*` does not cover. */
const OTHER_PAGE_URL = "about:blank";

const holdsCamera = (extension: Extension) =>
	expect
		.poll(() => cameraPageUrl(extension), { timeout: 15_000 })
		.toContain("offscreen.html");

const releasesCamera = (extension: Extension) =>
	expect
		.poll(() => cameraPageUrl(extension), { timeout: 15_000 })
		.toBeUndefined();

/** The red dot of Beta; the shadow root of the widget is open, so a plain selector reaches it. */
const cameraBadge = (page: Page) => page.locator(".camera-badge");

/** The profile is shared, so the script is installed for one test only. */
async function withScrollPlugin(
	extension: Extension,
	run: () => Promise<void>,
): Promise<void> {
	const plugins = await installPlugin(extension, SCROLL, TITLE);
	try {
		await run();
	} finally {
		await uninstallPlugin(plugins, TITLE);
	}
}

test("the install window says that the camera stays on while the page is in front", async ({
	extension,
}) => {
	const plugins = await extension.openPage("options.html");
	try {
		await plugins.setInputFiles("#plugin-file-input", SCROLL);
		await expect(plugins.getByRole("heading", { name: TITLE })).toBeVisible();
		await expect(
			plugins
				.getByRole("dialog")
				.getByText(/Keeps the camera on while a page this script works on/),
		).toBeVisible();
	} finally {
		await plugins.getByRole("button", { name: "Cancel" }).click();
	}
});

test("the camera is held for the page in front that a script works on, and goes when the page is another one", async ({
	extension,
}) => {
	await withScrollPlugin(extension, async () => {
		const blog = await extension.context.newPage();
		try {
			await blog.goto(`${DEMO_URL}/`);
			await holdsCamera(extension);
			await expect(cameraBadge(blog)).toBeVisible();
			await expect(cameraBadge(blog)).toContainText(TITLE);

			await blog.goto(OTHER_PAGE_URL);
			await releasesCamera(extension);
		} finally {
			await blog.close();
		}
	});
});

test("a matching page in the background does not hold the camera", async ({
	extension,
}) => {
	await withScrollPlugin(extension, async () => {
		const blog = await extension.context.newPage();
		let other: Page | undefined;
		try {
			await blog.goto(`${DEMO_URL}/`);
			await holdsCamera(extension);

			other = await extension.context.newPage();
			await other.goto(OTHER_PAGE_URL);
			await releasesCamera(extension);

			await blog.bringToFront();
			await holdsCamera(extension);
		} finally {
			await other?.close();
			await blog.close();
		}
	});
});

test("a click on the red dot pauses the camera for the page until it is reloaded", async ({
	extension,
}) => {
	await withScrollPlugin(extension, async () => {
		const blog = await extension.context.newPage();
		try {
			await blog.goto(`${DEMO_URL}/`);
			await holdsCamera(extension);

			await cameraBadge(blog).click();
			await releasesCamera(extension);
			await expect(cameraBadge(blog)).toBeHidden();

			await blog.reload();
			await holdsCamera(extension);
			await expect(cameraBadge(blog)).toBeVisible();
		} finally {
			await blog.close();
		}
	});
});

test("Turn off camera in the popup pauses the page in front, and a reload brings the camera back", async ({
	extension,
}) => {
	await withScrollPlugin(extension, async () => {
		const blog = await extension.context.newPage();
		const popup = await extension.openPage("popup.html");
		try {
			await blog.goto(`${DEMO_URL}/`);
			await blog.bringToFront();
			await holdsCamera(extension);
			/** The popup read its status before the page came to the front. */
			await popup.reload();
			await expect(
				popup.getByRole("button", { name: "Turn off camera" }),
			).toBeVisible();

			await popup.getByRole("button", { name: "Turn off camera" }).click();
			await expect(
				popup.getByText("Paused on this page until it is reloaded"),
			).toBeVisible();
			await releasesCamera(extension);

			await blog.reload();
			await holdsCamera(extension);
		} finally {
			await popup.close();
			await blog.close();
		}
	});
});
