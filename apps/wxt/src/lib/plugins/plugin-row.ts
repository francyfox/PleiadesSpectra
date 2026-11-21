import type { Gesture } from "@repo/protocol";
import { physiologicalNote, signalLabels } from "../signals/signals.utils";
import { cameraConsentNote, cameraModeText } from "./install-preview";
import type { PluginOverlap } from "./plugin-overlap";
import type { InstalledPlugin } from "./types";

export function sharesPagesText(names: string[]): string {
	return `Shares pages with: ${names.join(", ")}`;
}

/** Flat view model for one row of the scripts list, so the template only reads properties. */
export interface PluginRow {
	id: string;
	name: string;
	author: string;
	matches: string[];
	gestures: Gesture[];
	signals: string[];
	physiologicalNote: string;
	cameraText: string;
	cameraNote: string;
	cameraTone: "danger" | "neutral";
	enabledAria: string;
	/** `"true"` when an enabled script shares pages with another enabled one; drives the card highlight. */
	overlapAria: string;
	sharesText: string;
	overlapWarnings: string[];
}

export function toPluginRow(
	plugin: InstalledPlugin,
	overlap?: PluginOverlap,
): PluginRow {
	const { header } = plugin;
	return {
		id: plugin.id,
		name: header.name,
		author: header.author ?? "",
		matches: header.matches,
		gestures: header.gestures,
		signals: signalLabels(header.signals ?? []),
		physiologicalNote: physiologicalNote(header.signals ?? []),
		cameraText: cameraModeText(header.camera),
		cameraNote: cameraConsentNote(header.camera),
		cameraTone: header.camera === "always" ? "danger" : "neutral",
		enabledAria: String(plugin.enabled),
		overlapAria: String(overlap !== undefined),
		sharesText: overlap ? sharesPagesText(overlap.sharesWith) : "",
		overlapWarnings: overlap?.warnings ?? [],
	};
}
