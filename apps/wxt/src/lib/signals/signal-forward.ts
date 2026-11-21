import type { SignalSample } from "@repo/protocol";
import { browser } from "wxt/browser";
import type { SignalForwardMessage } from "../messages";
import type { TabAddress } from "./signals.service";

/** Background side: lists the tabs with an address (needs host permission, which the extension has). */
export async function listTabAddresses(): Promise<TabAddress[]> {
	const tabs = await browser.tabs.query({});
	return tabs.flatMap((tab) =>
		tab.id !== undefined && tab.url ? [{ id: tab.id, url: tab.url }] : [],
	);
}

/** Sends a sample to one tab; pages without a content script reject and that is fine. Not verified in a browser. */
export function sendSignalToTab(tabId: number, sample: SignalSample): void {
	const message: SignalForwardMessage = {
		type: "signal/forward",
		detail: JSON.stringify(sample),
	};
	browser.tabs.sendMessage(tabId, message).catch(() => {});
}
