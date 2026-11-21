import type { VitalName, WidgetPosition, WidgetSize } from "@repo/protocol";
import type { CheckView } from "./check/check";
import type { ExpressionScores } from "./emotion";

export interface AskOption {
	value: string;
	label: string;
	gestureLabel: string;
}

/** Background → content script. */
export type WidgetMessage =
	| {
			type: "widget/ask";
			pluginName: string;
			question: string;
			options: AskOption[];
			position?: WidgetPosition;
			size?: WidgetSize;
	  }
	| { type: "widget/listening"; timeoutMs: number }
	| { type: "widget/expression"; scores: ExpressionScores }
	/** A gesture the camera saw while the widget is open: Beta may strike a pose. */
	| { type: "widget/gesture"; gesture: string }
	/** The breathing rate in breaths per minute: Beta spins a pinwheel in time with it. */
	| { type: "widget/breathing"; rate: number }
	/** The heart rate in beats per minute; `stable` is the SDK's verdict. Beta shows a beating heart and the number. */
	| { type: "widget/pulse"; bpm: number; stable: boolean }
	| { type: "widget/accepted"; value: string }
	| { type: "widget/timeout" }
	| { type: "widget/error"; hint: string }
	/** Non-terminal advice while measuring (face not found, too dark); an empty hint clears it. */
	| { type: "widget/hint"; hint: string }
	| { type: "widget/toast"; text: string }
	| { type: "widget/hide" }
	/** A script shows a measurement without a question: Beta stays until `widget/hide-vital`. */
	| {
			type: "widget/show-vital";
			vital: VitalName;
			position?: WidgetPosition;
			size?: WidgetSize;
	  }
	| { type: "widget/hide-vital" }
	/** The always scripts that hold the camera for this tab: Beta stands on the page; an empty list sends her away. */
	| { type: "widget/presence"; plugins: string[] };

/** Content script → background. */
export type WidgetReply =
	| { type: "widget/answer"; value: string }
	| { type: "widget/camera-off" }
	/** The user clicked the camera indicator: pause the camera for this tab, leave questions alone. */
	| { type: "widget/pause-camera" }
	/** The widget of the page has started listening: the background sends it a show that began before that. */
	| { type: "widget/ready" };

const WIDGET_MESSAGE_TYPES: ReadonlySet<string> = new Set<
	WidgetMessage["type"]
>([
	"widget/ask",
	"widget/listening",
	"widget/expression",
	"widget/gesture",
	"widget/breathing",
	"widget/pulse",
	"widget/accepted",
	"widget/timeout",
	"widget/error",
	"widget/hint",
	"widget/toast",
	"widget/hide",
	"widget/show-vital",
	"widget/hide-vital",
	"widget/presence",
]);

export function isWidgetMessage(value: unknown): value is WidgetMessage {
	if (typeof value !== "object" || value === null) return false;
	const { type } = value as { type?: unknown };
	return typeof type === "string" && WIDGET_MESSAGE_TYPES.has(type);
}

/** Popup → background. */
export interface PopupStatusRequest {
	type: "popup/get-status";
}

export interface PopupStatus {
	cameraOwner: string | null;
	/** The tab in front is paused: no always script keeps the camera there until it is reloaded. */
	isActiveTabPaused: boolean;
	check: CheckView;
}

export function isPopupStatusRequest(
	value: unknown,
): value is PopupStatusRequest {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as { type?: unknown }).type === "popup/get-status"
	);
}

/** Background → content script: a gesture for the scripts of that page. */
export interface GestureForwardMessage {
	type: "gesture/forward";
	/** JSON of `GestureEventDetail`: an object would be unreadable across extension worlds. */
	detail: string;
}

export function isGestureForwardMessage(
	value: unknown,
): value is GestureForwardMessage {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as { type?: unknown }).type === "gesture/forward"
	);
}

export function isWidgetReply(value: unknown): value is WidgetReply {
	if (typeof value !== "object" || value === null) return false;
	const { type } = value as { type?: unknown };
	return (
		type === "widget/answer" ||
		type === "widget/camera-off" ||
		type === "widget/pause-camera" ||
		type === "widget/ready"
	);
}

/** Popup → background: start or stop the Spectra check. */
export interface CheckCommand {
	type: "spectra/check-start" | "spectra/check-stop";
}

export function isCheckCommand(value: unknown): value is CheckCommand {
	const type = (value as { type?: unknown } | null)?.type;
	return type === "spectra/check-start" || type === "spectra/check-stop";
}

/** Popup → background: the popup shows the face mask over its preview, or stopped doing so. */
export interface MaskCommand {
	type: "popup/mask";
	enabled: boolean;
}

export function isMaskCommand(value: unknown): value is MaskCommand {
	const candidate = value as { type?: unknown; enabled?: unknown } | null;
	return (
		candidate?.type === "popup/mask" && typeof candidate.enabled === "boolean"
	);
}

/** The face landmarks of one picture, flat `[x0, y0, x1, y1, ...]` in pixels of a frame `width` × `height`. */
export interface FaceMask {
	width: number;
	height: number;
	points: number[];
}

/** Background → popup, while it is open. */
export type SpectraUpdate =
	| { type: "spectra/view"; view: CheckView }
	| ({ type: "spectra/mask" } & FaceMask);

export function isSpectraUpdate(value: unknown): value is SpectraUpdate {
	const type = (value as { type?: unknown } | null)?.type;
	return type === "spectra/view" || type === "spectra/mask";
}

/** Background → content script: a signal sample for the scripts of that page. */
export interface SignalForwardMessage {
	type: "signal/forward";
	/** JSON of `SignalSample`: an object would be unreadable across extension worlds. */
	detail: string;
}

export function isSignalForwardMessage(
	value: unknown,
): value is SignalForwardMessage {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as { type?: unknown }).type === "signal/forward"
	);
}
