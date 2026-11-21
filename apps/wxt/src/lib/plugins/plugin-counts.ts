import type { InstalledPlugin } from "./types";

export interface PluginCounts {
	active: number;
	disabled: number;
}

/** How many installed scripts are switched on and how many are switched off, for the button of the popup. */
export function countPlugins(
	plugins: readonly InstalledPlugin[],
): PluginCounts {
	const active = plugins.filter((plugin) => plugin.enabled).length;
	return { active, disabled: plugins.length - active };
}
