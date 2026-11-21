import { browser } from "wxt/browser";

const SHOW_LOGS_KEY = "showLogs";
export const PLUGINS_ENABLED_KEY = "pluginsEnabled";

export async function loadShowLogs(): Promise<boolean> {
	const stored = await browser.storage.local.get(SHOW_LOGS_KEY);
	return stored[SHOW_LOGS_KEY] === true;
}

export async function saveShowLogs(enabled: boolean): Promise<void> {
	await browser.storage.local.set({ [SHOW_LOGS_KEY]: enabled });
}

/** The main switch of the popup: on unless it was switched off. */
export async function loadPluginsEnabled(): Promise<boolean> {
	const stored = await browser.storage.local.get(PLUGINS_ENABLED_KEY);
	return stored[PLUGINS_ENABLED_KEY] !== false;
}

export async function savePluginsEnabled(enabled: boolean): Promise<void> {
	await browser.storage.local.set({ [PLUGINS_ENABLED_KEY]: enabled });
}
