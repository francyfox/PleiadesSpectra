import type { Gesture } from "./gestures";
import type { SignalName } from "./signals";
import type { WidgetPosition, WidgetSize } from "./widget-look";

export type CameraMode = "on-demand" | "always";

/** Parsed `==Reaction==` header: what the extension reads without running the script code. */
export interface PluginHeader {
	name: string;
	author: string | null;
	matches: string[];
	camera: CameraMode;
	gestures: Gesture[];
	/** Signals the script reads (`@signals`); the install window lists them and only these are delivered to it. */
	signals: SignalName[];
}

export interface AskOption {
	value: Gesture;
	label: string;
	gestureLabel: string;
}

/**
 * Script (USER_SCRIPT world) → background, via `runtime.sendMessage`.
 * `reaction/ask` is answered with `AskAnswer`.
 */
/** What Beta can show without a question: the measurement and its picture (the heart, the pinwheel). */
export const vitalNames = ["pulse", "breathing"] as const;

export type VitalName = (typeof vitalNames)[number];

export function isVitalName(value: unknown): value is VitalName {
	return (vitalNames as readonly unknown[]).includes(value);
}

export type PluginMessage =
	| {
			type: "reaction/ask";
			pluginName: string;
			question: string;
			options: AskOption[];
			timeoutMs: number;
			position?: WidgetPosition;
			size?: WidgetSize;
	  }
	| { type: "reaction/toast"; pluginName: string; text: string }
	/**
	 * Beta stands on the page without a question and shows a measurement, as long as the samples of that signal
	 * come (the script must declare it in `@signals` and the camera must run, `@camera always`). `position` and `size`
	 * are checked like those of `reaction/ask`.
	 */
	| {
			type: "reaction/show";
			pluginName: string;
			vital: VitalName;
			position?: WidgetPosition;
			size?: WidgetSize;
	  }
	/** Takes Beta away again (`ctx.hide()`, or the reaction stops). */
	| { type: "reaction/hide"; pluginName: string }
	/** The page moved on (a single-page route change, the trigger element is gone): drop the open question. */
	| { type: "reaction/cancel-ask"; pluginName: string };

/** The gesture the user made, a mouse click on an option (`value`), or "timeout". */
export type AskAnswer = Gesture | "timeout";

/** A gesture the camera recognised; the extension delivers it to the page as a `CustomEvent` on `window`. */
export interface GestureEventDetail {
	gesture: Gesture;
	/** 0–1 */
	confidence: number;
}

export const GESTURE_EVENT_NAME = "pleiades:gesture";
