import type { InstalledPlugin } from "../plugins/types";

interface UserScriptSender {
	userScriptWorldId?: string;
	userScriptId?: string;
}

/**
 * The runtime sends the id passed to `reaction("id")`, not the header `@name`.
 * The sender's world id (equal to the stored script id) gives the real name; fall back to the sent id.
 */
export function resolvePluginDisplayName(
	plugins: readonly InstalledPlugin[],
	sender: object,
	sentName: string,
): string {
	const { userScriptWorldId, userScriptId } = sender as UserScriptSender;
	const worldId = userScriptWorldId ?? userScriptId;
	const byWorld = plugins.find((plugin) => plugin.id === worldId);
	if (byWorld) return byWorld.header.name;
	const byName = plugins.find(
		(plugin) => plugin.id === sentName || plugin.header.name === sentName,
	);
	return byName?.header.name ?? sentName;
}
