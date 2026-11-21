import { browser } from "wxt/browser";
import { removePlugin, upsertPlugin, withPluginEnabled } from "./plugin-list";
import type { InstalledPlugin } from "./types";

const PLUGINS_KEY = "plugins";

/** An array that an earlier version stored as `{"0": …}` comes back as an array. */
export function asArray<Item>(value: Item[] | Record<string, Item>): Item[] {
	return Array.isArray(value) ? value : Object.values(value ?? {});
}

/** Scripts saved before the fix below have `matches` and `gestures` as objects; `register` refuses those. */
export function repairPlugin(plugin: InstalledPlugin): InstalledPlugin {
	const { header } = plugin;
	return {
		...plugin,
		header: {
			...header,
			matches: asArray(header.matches),
			gestures: asArray(header.gestures),
			signals: asArray(header.signals),
		},
	};
}

export async function listStoredPlugins(): Promise<InstalledPlugin[]> {
	const stored = await browser.storage.local.get(PLUGINS_KEY);
	const plugins = (stored[PLUGINS_KEY] as InstalledPlugin[] | undefined) ?? [];
	return plugins.map(repairPlugin);
}

/**
 * The page hands in Alpine proxies, and the extension API stores a proxy as an empty object (`matches` came out
 * as `{}`, and `userScripts.register` refused it). A JSON round trip leaves plain data.
 */
function toPlainData<Value>(value: Value): Value {
	return JSON.parse(JSON.stringify(value)) as Value;
}

async function writePlugins(plugins: InstalledPlugin[]): Promise<void> {
	await browser.storage.local.set({ [PLUGINS_KEY]: toPlainData(plugins) });
}

export async function savePlugin(plugin: InstalledPlugin): Promise<void> {
	await writePlugins(upsertPlugin(await listStoredPlugins(), plugin));
}

export async function deletePlugin(id: string): Promise<void> {
	await writePlugins(removePlugin(await listStoredPlugins(), id));
}

export async function setPluginEnabled(
	id: string,
	enabled: boolean,
): Promise<void> {
	await writePlugins(withPluginEnabled(await listStoredPlugins(), id, enabled));
}
