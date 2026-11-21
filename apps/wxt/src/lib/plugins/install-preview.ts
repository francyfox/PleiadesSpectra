import type { PluginHeader } from "@repo/protocol";
import { parseHeader } from "./reactions-adapter";

/** `proposalId` is set when an AI agent proposed the script instead of the user choosing a file. */
export type InstallPreview = { proposalId?: string } & (
	| { valid: true; fileName: string; source: string; header: PluginHeader }
	| { valid: false; fileName: string; error: string }
);

/** Turns a chosen file into what the install dialog shows. Nothing is stored here. */
export function prepareInstallPreview(
	fileName: string,
	source: string,
): InstallPreview {
	const parsed = parseHeader(source);
	if (!parsed.ok) return { valid: false, fileName, error: parsed.error };
	return { valid: true, fileName, source, header: parsed.header };
}

export const ALWAYS_CAMERA_NOTE =
	"Keeps the camera on while a page this script works on is open and in front. Beta stands in the corner with a red dot while it runs; click the dot or use the popup to pause it.";

/** The consent line next to the red chip: said for `@camera always`, empty for the rest. */
export function cameraConsentNote(camera: PluginHeader["camera"]): string {
	return camera === "always" ? ALWAYS_CAMERA_NOTE : "";
}

export function cameraModeText(camera: PluginHeader["camera"]): string {
	return camera === "always" ? "Always on" : "On demand";
}
