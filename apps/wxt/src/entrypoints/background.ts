import { startBackground } from "@/lib/background/background-app";

const BLANK_TAB_URL = "about:blank";

/**
 * Dev only. Every extension reload (a change in the background or the manifest) closes the extension's
 * own tabs and leaves the empty `about:blank` tab the dev browser opened. This puts the test page back,
 * in that blank tab when there is one, and never opens a second copy.
 */
async function ensureTestPage(): Promise<void> {
	const url = browser.runtime.getURL("/test.html");
	const tabs = await browser.tabs.query({});
	if (tabs.some((tab) => tab.url?.startsWith(url))) return;

	const blank = tabs.find((tab) => tab.url === BLANK_TAB_URL);
	if (blank?.id !== undefined)
		await browser.tabs.update(blank.id, { url, active: true });
	else await browser.tabs.create({ url });
}

const REOPEN_ATTEMPTS = 3;
const REOPEN_RETRY_MS = 700;

/** The dev browser may show its blank tab a moment after the reload; one try can come too early. */
async function ensureTestPageWithRetry(): Promise<void> {
	for (let attempt = 0; attempt < REOPEN_ATTEMPTS; attempt += 1) {
		await ensureTestPage().catch(() => {});
		await new Promise((resolve) => setTimeout(resolve, REOPEN_RETRY_MS));
	}
}

function keepTestPageOpen(): void {
	browser.runtime.onInstalled.addListener(() => void ensureTestPageWithRetry());
	browser.runtime.onStartup.addListener(() => void ensureTestPageWithRetry());
}

export default defineBackground(() => {
	startBackground();
	if (import.meta.env.DEV) keepTestPageOpen();
});
