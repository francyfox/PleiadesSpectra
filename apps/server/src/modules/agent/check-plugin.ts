import type { PluginHeader } from "@repo/protocol";
import { parseHeader } from "@repo/reactions/header";

export type PluginCheck =
	| { ok: true; header: PluginHeader }
	| { ok: false; error: string };

/** Reads only the `==Reaction==` header; the script code is never executed. */
export function checkPlugin(source: string): PluginCheck {
	const parsed = parseHeader(source);
	return parsed.ok
		? { ok: true, header: parsed.header }
		: { ok: false, error: parsed.error };
}

export function describeHeader(header: PluginHeader): string {
	return [
		`name: ${header.name}`,
		`author: ${header.author ?? "unknown"}`,
		`match: ${header.matches.join(", ")}`,
		`camera: ${header.camera}`,
		`gestures: ${header.gestures.join(", ") || "none"}`,
	].join("\n");
}
