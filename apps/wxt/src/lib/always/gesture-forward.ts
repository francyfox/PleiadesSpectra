import type { GestureEventDetail } from "@repo/protocol";
import { browser } from "wxt/browser";
import type { GestureForwardMessage } from "../messages";

/** Sends a gesture to every tab; only pages with a content script react. Not verified in a browser. */
export async function forwardGestureToTabs(
	detail: GestureEventDetail,
): Promise<void> {
	const message: GestureForwardMessage = {
		type: "gesture/forward",
		detail: JSON.stringify(detail),
	};
	const tabs = await browser.tabs.query({});
	for (const tab of tabs)
		if (tab.id !== undefined)
			browser.tabs.sendMessage(tab.id, message).catch(() => {});
}
