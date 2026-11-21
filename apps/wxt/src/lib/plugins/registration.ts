import { PERMISSIONS_GLOBAL_NAME } from "@repo/reactions/permissions";
import type { InstalledPlugin } from "./types";

export interface PluginRegistration {
	id: string;
	matches: string[];
	js: Array<{ code: string }>;
	world: "USER_SCRIPT";
	worldId: string;
	runAt: "document_idle";
}

/** Code that hands the script's declared `@signals` and `@gestures` to its world, before the runtime. */
export function permissionsSource(plugin: InstalledPlugin): string {
	const { signals, gestures } = plugin.header;
	return `globalThis.${PERMISSIONS_GLOBAL_NAME} = ${JSON.stringify({ signals, gestures })};`;
}

/** One isolated world per script (`worldId`), runtime first so `reaction` exists when the script runs. */
export function buildRegistration(
	plugin: InstalledPlugin,
	runtimeSource: string,
): PluginRegistration {
	return {
		id: plugin.id,
		matches: plugin.header.matches,
		js: [
			{ code: permissionsSource(plugin) },
			{ code: runtimeSource },
			{ code: plugin.source },
		],
		world: "USER_SCRIPT",
		worldId: plugin.id,
		runAt: "document_idle",
	};
}

export function registrationsFor(
	plugins: readonly InstalledPlugin[],
	runtimeSource: string,
): PluginRegistration[] {
	return plugins
		.filter((plugin) => plugin.enabled)
		.map((plugin) => buildRegistration(plugin, runtimeSource));
}
