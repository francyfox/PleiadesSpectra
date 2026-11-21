import type { PluginHeader } from "@repo/protocol";

export interface InstalledPlugin {
	id: string;
	source: string;
	header: PluginHeader;
	enabled: boolean;
}
