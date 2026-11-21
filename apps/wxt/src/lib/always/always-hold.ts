import type { InstalledPlugin } from "../plugins/types";
import { matchesUrl } from "../signals/signals.utils";

/** The tab in front in the window the user used last. */
export interface ActiveTab {
	id: number;
	url: string;
}

function isAlwaysPluginForUrl(plugin: InstalledPlugin, url: string): boolean {
	return (
		plugin.enabled &&
		plugin.header.camera === "always" &&
		plugin.header.matches.some((pattern) => matchesUrl(pattern, url))
	);
}

/**
 * Names of the scripts that keep the camera on for the tab in front: enabled `@camera always` scripts whose `@match`
 * covers its address. A paused tab, or no tab, has none.
 */
export function holdingPluginNames(
	plugins: readonly InstalledPlugin[],
	activeTab: ActiveTab | null,
	pausedTabIds: ReadonlySet<number>,
): string[] {
	if (!activeTab || pausedTabIds.has(activeTab.id)) return [];
	return plugins
		.filter((plugin) => isAlwaysPluginForUrl(plugin, activeTab.url))
		.map((plugin) => plugin.header.name);
}

/**
 * The camera for `@camera always` runs only while the tab in front is a page such an enabled script works on and
 * the user has not paused that tab. A matching tab in the background, or the wrong site in front, holds nothing.
 */
export function shouldHoldCamera(
	plugins: readonly InstalledPlugin[],
	activeTab: ActiveTab | null,
	pausedTabIds: ReadonlySet<number>,
): boolean {
	return holdingPluginNames(plugins, activeTab, pausedTabIds).length > 0;
}
