import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	type BrowserContext,
	test as base,
	chromium,
	type Page,
} from "@playwright/test";

/** The built extension: run `bun run build` in `apps/wxt` first. */
const EXTENSION_PATH = resolve(
	import.meta.dirname,
	"../../wxt/.output/chrome-mv3",
);
const DEBUGGING_PORT = 9333;
const CHROME = process.env.CHROME_PATH ?? "google-chrome-stable";

export interface Extension {
	context: BrowserContext;
	id: string;
	/** Opens the extension's own page, e.g. `options.html`. */
	openPage(name: string): Promise<Page>;
}

async function waitForDebugger(): Promise<void> {
	for (let attempt = 0; attempt < 60; attempt += 1) {
		try {
			const response = await fetch(
				`http://127.0.0.1:${DEBUGGING_PORT}/json/version`,
			);
			if (response.ok) return;
		} catch {}
		await new Promise((resolveWait) => setTimeout(resolveWait, 200));
	}
	throw new Error("Chrome did not start");
}

function launchChrome(userDataDir: string): ChildProcess {
	return spawn(
		CHROME,
		[
			"--headless=new",
			`--remote-debugging-port=${DEBUGGING_PORT}`,
			/** Lets the debugger load an unpacked extension into branded Chrome. */
			"--enable-unsafe-extension-debugging",
			/** A synthetic camera, and no permission prompt for it. */
			"--use-fake-device-for-media-stream",
			"--use-fake-ui-for-media-stream",
			`--user-data-dir=${userDataDir}`,
			"--no-first-run",
			"--no-default-browser-check",
			"about:blank",
		],
		{ stdio: "ignore" },
	);
}

/**
 * Chrome 138+ needs “Allow User Scripts” switched on per extension; the extensions page can do it itself.
 * The service worker only sees the user scripts API if it starts after that, so the extension reloads itself.
 */
async function allowUserScripts(
	context: BrowserContext,
	extensionId: string,
): Promise<void> {
	const page = await context.newPage();
	await page.goto("chrome://extensions");
	await page.evaluate(
		(id) =>
			// @ts-expect-error `chrome.developerPrivate` exists only on the chrome:// page
			chrome.developerPrivate.updateExtensionConfiguration({
				extensionId: id,
				userScriptsAccess: true,
			}),
		extensionId,
	);
	await page.close();

	const [worker] = context.serviceWorkers();
	await worker?.evaluate(() => chrome.runtime.reload()).catch(() => {});
	await waitForUserScriptsInServiceWorker(context, extensionId);
}

async function waitForUserScriptsInServiceWorker(
	context: BrowserContext,
	extensionId: string,
): Promise<void> {
	for (let attempt = 0; attempt < 60; attempt += 1) {
		/** A reloaded service worker starts lazily: opening a page of the extension wakes it. */
		const waker = await context.newPage();
		await waker
			.goto(`chrome-extension://${extensionId}/popup.html`)
			.catch(() => {});
		const [worker] = context.serviceWorkers();
		const hasApi = await worker
			?.evaluate(() => typeof chrome.userScripts?.register === "function")
			.catch(() => false);
		await waker.close();
		if (hasApi) return;
		await new Promise((resolveWait) => setTimeout(resolveWait, 300));
	}
	throw new Error("The user scripts API never reached the service worker");
}

export const test = base.extend<object, { extension: Extension }>({
	extension: [
		// biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures it needs from this parameter
		async ({}, use) => {
			const userDataDir = mkdtempSync(join(tmpdir(), "pleiades-e2e-"));
			const chrome = launchChrome(userDataDir);
			try {
				await waitForDebugger();
				const browser = await chromium.connectOverCDP(
					`http://127.0.0.1:${DEBUGGING_PORT}`,
				);
				const session = await browser.newBrowserCDPSession();
				const { id } = await session.send("Extensions.loadUnpacked", {
					path: EXTENSION_PATH,
				});
				const context = browser.contexts()[0] as BrowserContext;
				await allowUserScripts(context, id);

				await use({
					context,
					id,
					openPage: async (name) => {
						const page = await context.newPage();
						await page.goto(`chrome-extension://${id}/${name}`);
						return page;
					},
				});
				await browser.close();
			} finally {
				chrome.kill();
				rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5 });
			}
		},
		{ scope: "worker" },
	],
});

export { expect } from "@playwright/test";
