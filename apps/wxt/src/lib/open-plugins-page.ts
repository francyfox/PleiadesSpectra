import { browser } from "wxt/browser";

export const AGENT_DIALOG_HASH = "#agent";

/**
 * Opens the Scripts page, or focuses it when it is already open. A second page would take the agent
 * connection over from the first one, so there must only ever be one.
 */
export async function openPluginsPage(hash = ""): Promise<void> {
	const url = browser.runtime.getURL("/options.html");
	const [existing] = await browser.tabs.query({ url: `${url}*` });
	if (existing?.id === undefined) {
		await browser.tabs.create({ url: `${url}${hash}` });
		return;
	}
	await browser.tabs.update(existing.id, {
		active: true,
		url: `${url}${hash}`,
	});
	if (existing.windowId !== undefined)
		await browser.windows.update(existing.windowId, { focused: true });
}
