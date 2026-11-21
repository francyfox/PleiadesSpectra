import type { InstalledPlugin } from "./types";

/** Replaces the script with the same name, otherwise appends. A reinstall must not duplicate. */
export function upsertPlugin(
	plugins: readonly InstalledPlugin[],
	plugin: InstalledPlugin,
): InstalledPlugin[] {
	const others = plugins.filter(
		(existing) => existing.header.name !== plugin.header.name,
	);
	return [...others, plugin];
}

export function removePlugin(
	plugins: readonly InstalledPlugin[],
	id: string,
): InstalledPlugin[] {
	return plugins.filter((plugin) => plugin.id !== id);
}

export function withPluginEnabled(
	plugins: readonly InstalledPlugin[],
	id: string,
	enabled: boolean,
): InstalledPlugin[] {
	return plugins.map((plugin) =>
		plugin.id === id ? { ...plugin, enabled } : plugin,
	);
}
