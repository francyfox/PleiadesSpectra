import { browser } from "wxt/browser";
import type { ActiveTab } from "./always-hold";

/** The tab in front of the window the user used last; a tab whose address is hidden from the extension counts as none. */
export async function queryActiveTab(): Promise<ActiveTab | null> {
	const [tab] = await browser.tabs.query({
		active: true,
		lastFocusedWindow: true,
	});
	if (tab?.id === undefined || !tab.url) return null;
	return { id: tab.id, url: tab.url };
}
