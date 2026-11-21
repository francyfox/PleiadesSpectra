import { browser } from "wxt/browser";

const PAUSED_TABS_KEY = "pausedTabIds";

/** Tab ids live only as long as the browser session, so the session storage is the right place for them. */
export async function loadPausedTabIds(): Promise<number[]> {
	const stored = await browser.storage.session.get(PAUSED_TABS_KEY);
	const value = stored[PAUSED_TABS_KEY];
	return Array.isArray(value)
		? value.filter((id) => typeof id === "number")
		: [];
}

export async function savePausedTabIds(tabIds: number[]): Promise<void> {
	await browser.storage.session.set({ [PAUSED_TABS_KEY]: tabIds });
}
