import { browser } from "wxt/browser";
import { loadPluginsEnabled } from "../popup-settings";
import { PLUGIN_RUNTIME_SOURCE } from "./reactions-adapter";
import { type PluginRegistration, registrationsFor } from "./registration";
import { listStoredPlugins } from "./store";
import type { InstalledPlugin } from "./types";

export type { InstalledPlugin } from "./types";

export function listInstalledPlugins(): Promise<InstalledPlugin[]> {
	return listStoredPlugins();
}

/** Chrome throws until the user enables "Allow User Scripts"; Firefox until the permission is granted. */
export async function isUserScriptsAvailable(): Promise<boolean> {
	try {
		await browser.userScripts.getScripts();
		return true;
	} catch {
		return false;
	}
}

const LOG_PREFIX = "[Pleiades Spectra] scripts";

/** Everything the console needs to find out why a script does not run. */
function reportRegistrationFailure(
	error: unknown,
	registrations: readonly PluginRegistration[],
): void {
	console.error(`${LOG_PREFIX}: registering user scripts failed`, error, {
		plugins: registrations.map(({ id, matches }) => ({ id, matches })),
	});
}

async function registerAll(
	plugins: readonly InstalledPlugin[],
): Promise<PluginRegistration[]> {
	await browser.userScripts.unregister();
	for (const plugin of plugins.filter((item) => item.enabled))
		await browser.userScripts.configureWorld({
			worldId: plugin.id,
			messaging: true,
		});
	const registrations = registrationsFor(plugins, PLUGIN_RUNTIME_SOURCE);
	if (registrations.length === 0) return registrations;
	try {
		await browser.userScripts.register(registrations);
	} catch (error) {
		reportRegistrationFailure(error, registrations);
		throw error;
	}
	return registrations;
}

/**
 * Makes the registered user scripts match the stored scripts: all old ones go, enabled ones come back.
 * Call it on install, delete, toggle and when the background starts (Firefox drops scripts on update).
 * A failure is printed to the console of whoever called, and thrown.
 */
export async function registerInstalledPlugins(): Promise<void> {
	if (!(await isUserScriptsAvailable())) {
		console.warn(
			`${LOG_PREFIX}: user scripts are not available, turn on “Allow User Scripts” for the extension`,
		);
		return;
	}
	if (!(await loadPluginsEnabled())) {
		await browser.userScripts.unregister();
		console.info(
			`${LOG_PREFIX}: switched off in the popup, none is registered`,
		);
		return;
	}
	const registrations = await registerAll(await listStoredPlugins());
	console.info(
		`${LOG_PREFIX}: registered`,
		registrations.map(({ id, matches }) => ({ id, matches })),
	);
}
