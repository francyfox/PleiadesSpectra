import type { VitalName } from "@repo/protocol";
import {
	GESTURE_POSE_MS,
	nextShakeIsMirrored,
	type PoseName,
	PULSE_POSE_MS,
	poseForGesture,
} from "./beta-pose";
import { type Emotion, type EmotionTracker, trackExpression } from "./emotion";
import type { AskOption, WidgetMessage } from "./messages";
import {
	AUTO_SIZE,
	DEFAULT_PLACE,
	defaultLook,
	type WidgetLook,
} from "./widget-layout";

export type Phase =
	| "idle"
	| "warmup"
	| "listening"
	| "accepted"
	| "timeout"
	| "error";

export interface WidgetState {
	phase: Phase;
	pluginName: string;
	question: string;
	options: AskOption[];
	deadlineAt: number | null;
	errorHint: string;
	/** Advice from SDK validation shown while warming up or listening. */
	hint: string;
	toast: Toast | null;
	cameraOn: boolean;
	/**
	 * Names of the always scripts that hold the camera for this page. While there are some, Beta stands on the page
	 * without a question or a show; like `shownVital` it outlives questions.
	 */
	presence: string[];
	tracker: EmotionTracker;
	gesturePose: GesturePose | null;
	pulse: Pulse | null;
	/** Which side the last `shake` turned to, so the next one turns to the other. */
	isShakeMirrored: boolean;
	/** Where Beta stands and how big she is; set by each question, or by the show while no question is open. */
	look: WidgetLook;
	/**
	 * The measurement a script shows without a question. It lives apart from the question: `widget/ask` and
	 * `widget/hide` rebuild the state of a question, and both carry `shownVital` and `shownLook` over, so a question
	 * that ends does not take Beta away from the script that still shows. Only `widget/hide-vital` clears it.
	 */
	shownVital: VitalName | null;
	/** When the show began; a measurement that has not come after `NO_SIGNAL_AFTER_MS` is called missing. */
	shownAtMs: number;
	/** The place and size of the show; `look` goes back to it when a question ends. */
	shownLook: WidgetLook;
}

/** A pose that a gesture struck; it fades by itself at `untilMs`. */
export interface GesturePose {
	name: PoseName;
	untilMs: number;
	/** Turned the other way (the turning head of `shake` goes to both sides). */
	isMirrored: boolean;
}

export interface Pulse {
	/** Beats per minute. */
	bpm: number;
	stable: boolean;
	untilMs: number;
}

/** What Beta shows instead of the drawn face. */
export interface ShownPose {
	name: PoseName;
	isMirrored: boolean;
}

export interface Toast {
	text: string;
	untilMs: number;
}

const TOAST_DURATION_MS = 3000;

const EMOTION_BY_SERVICE_PHASE: Record<Exclude<Phase, "listening">, Emotion> = {
	idle: "neutral",
	warmup: "focused",
	accepted: "happy",
	timeout: "confused",
	error: "sad",
};

const STATUS_TEXT_BY_PHASE: Record<Phase, string> = {
	idle: "",
	warmup: "looking…",
	listening: "smile or click an answer",
	accepted: "Got it",
	timeout: "Couldn't tell, click an answer",
	error: "",
};

export function createInitialState(): WidgetState {
	return {
		phase: "idle",
		pluginName: "",
		question: "",
		options: [],
		deadlineAt: null,
		errorHint: "",
		hint: "",
		toast: null,
		cameraOn: false,
		presence: [],
		tracker: { emotion: "neutral", changedAt: 0 },
		gesturePose: null,
		pulse: null,
		isShakeMirrored: false,
		look: defaultLook,
		shownVital: null,
		shownAtMs: 0,
		shownLook: defaultLook,
	};
}

const MEASURING_TEXT = "measuring…";
const NO_SIGNAL_TEXT = "no signal";

/** Samples come every second or so once the camera runs; this long without one means the camera is not running. */
export const NO_SIGNAL_AFTER_MS = 8000;

/** Where Beta stands when only the camera of scripts brings her: in the usual corner, in the size of the window. */
export const presenceLook: WidgetLook = {
	position: DEFAULT_PLACE,
	size: AUTO_SIZE,
};

/** What stays of the state when a question ends or is replaced: the toast, the presence and the show of a measurement. */
function keepAcrossQuestion(state: WidgetState): Partial<WidgetState> {
	const { toast, presence, shownVital, shownLook, shownAtMs } = state;
	if (!shownVital)
		return presence.length > 0
			? { toast, presence, look: presenceLook }
			: { toast };
	return {
		toast,
		presence,
		shownVital,
		shownAtMs,
		shownLook,
		look: shownLook,
		pulse: state.pulse,
	};
}

export function applyMessage(
	state: WidgetState,
	message: WidgetMessage,
	nowMs: number,
): WidgetState {
	switch (message.type) {
		case "widget/ask":
			return {
				...createInitialState(),
				...keepAcrossQuestion(state),
				phase: "warmup",
				pluginName: message.pluginName,
				question: message.question,
				options: message.options,
				cameraOn: true,
				look: {
					position: message.position ?? defaultLook.position,
					size: message.size ?? defaultLook.size,
				},
			};
		case "widget/listening":
			return {
				...state,
				phase: "listening",
				deadlineAt: nowMs + message.timeoutMs,
			};
		case "widget/expression":
			return {
				...state,
				tracker: trackExpression(state.tracker, message.scores, nowMs),
			};
		case "widget/gesture":
			return applyGesture(state, message.gesture, nowMs);
		case "widget/pulse":
			return {
				...state,
				pulse: {
					bpm: message.bpm,
					stable: message.stable,
					untilMs: nowMs + PULSE_POSE_MS,
				},
			};
		case "widget/accepted":
			return { ...state, phase: "accepted", cameraOn: false, deadlineAt: null };
		case "widget/timeout":
			return { ...state, phase: "timeout", cameraOn: false, deadlineAt: null };
		case "widget/error":
			return {
				...state,
				phase: "error",
				errorHint: message.hint,
				cameraOn: false,
				deadlineAt: null,
			};
		case "widget/hint":
			return { ...state, hint: message.hint };
		case "widget/toast":
			return {
				...state,
				toast: { text: message.text, untilMs: nowMs + TOAST_DURATION_MS },
			};
		case "widget/hide":
			return { ...createInitialState(), ...keepAcrossQuestion(state) };
		case "widget/show-vital":
			return showVital(state, message, nowMs);
		case "widget/hide-vital":
			return state.phase === "idle"
				? {
						...createInitialState(),
						...keepAcrossQuestion({ ...state, shownVital: null }),
					}
				: { ...state, shownVital: null, shownLook: defaultLook };
		case "widget/presence":
			return withPresence(state, message.plugins);
	}
}

/** Beta comes with the scripts' camera and goes with it, unless a question or a show keeps her. */
function withPresence(state: WidgetState, presence: string[]): WidgetState {
	const isResting = state.phase === "idle" && state.shownVital === null;
	if (!isResting) return { ...state, presence };
	return {
		...state,
		presence,
		look: presence.length > 0 ? presenceLook : defaultLook,
	};
}

function showVital(
	state: WidgetState,
	message: Extract<WidgetMessage, { type: "widget/show-vital" }>,
	nowMs: number,
): WidgetState {
	const shownLook: WidgetLook = {
		position: message.position ?? defaultLook.position,
		size: message.size ?? defaultLook.size,
	};
	return {
		...state,
		shownVital: message.vital,
		shownAtMs: nowMs,
		shownLook,
		pulse: message.vital === state.shownVital ? state.pulse : null,
		look: state.phase === "idle" ? shownLook : state.look,
	};
}

function applyGesture(
	state: WidgetState,
	gesture: string,
	nowMs: number,
): WidgetState {
	const name = poseForGesture(gesture);
	if (!name) return state;
	const isMirrored =
		gesture === "shake" ? nextShakeIsMirrored(state.isShakeMirrored) : false;
	return {
		...state,
		gesturePose: { name, untilMs: nowMs + GESTURE_POSE_MS, isMirrored },
		isShakeMirrored: gesture === "shake" ? isMirrored : state.isShakeMirrored,
	};
}

/**
 * A gesture pose wins; otherwise Beta shows the heart while pulse samples keep coming, and the pinwheel (the loader)
 * while a shown pulse waits for its first sample, or for the next one after the last one has gone old.
 */
export function poseOf(state: WidgetState, nowMs: number): ShownPose | null {
	const { gesturePose, pulse } = state;
	if (gesturePose && nowMs < gesturePose.untilMs)
		return { name: gesturePose.name, isMirrored: gesturePose.isMirrored };
	if (pulse && nowMs < pulse.untilMs)
		return { name: "heart", isMirrored: false };
	if (isMeasuring(state, nowMs)) return { name: "blow", isMirrored: false };
	return null;
}

export function pulseOf(state: WidgetState): Pulse | null {
	return state.pulse;
}

export function emotionOf(state: WidgetState): Emotion {
	if (state.phase === "listening" || isHeldByPlugins(state))
		return state.tracker.emotion;
	return EMOTION_BY_SERVICE_PHASE[state.phase];
}

/** Beta is on the page while a question is open, a script shows a measurement or scripts hold the camera. */
export function isVisible(state: WidgetState): boolean {
	return (
		state.phase !== "idle" ||
		state.shownVital !== null ||
		state.presence.length > 0
	);
}

/** The card with the question is only for a question; a shown measurement has no card. */
export function isQuestionVisible(state: WidgetState): boolean {
	return state.phase !== "idle";
}

/** True while a measurement is shown without a question and no sample of it has come yet (or the last one is old). */
export function isMeasuring(state: WidgetState, nowMs: number): boolean {
	if (state.phase !== "idle" || state.shownVital === null) return false;
	return state.pulse === null || nowMs >= state.pulse.untilMs;
}

export function statusTextOf(state: WidgetState, nowMs: number): string {
	if (isMeasuring(state, nowMs))
		return nowMs - state.shownAtMs >= NO_SIGNAL_AFTER_MS
			? NO_SIGNAL_TEXT
			: MEASURING_TEXT;
	if (state.phase === "error") return state.errorHint;
	if (state.hint && (state.phase === "warmup" || state.phase === "listening"))
		return state.hint;
	return STATUS_TEXT_BY_PHASE[state.phase];
}

export function secondsLeft(state: WidgetState, nowMs: number): number {
	if (state.deadlineAt === null) return 0;
	return Math.max(0, Math.ceil((state.deadlineAt - nowMs) / 1000));
}

/** Camera dot: pulsing while warming up, steady while listening, grey otherwise. */
export function cameraToneOf(state: WidgetState): "off" | "busy" | "live" {
	if (!state.cameraOn) return isHeldByPlugins(state) ? "live" : "off";
	return state.phase === "warmup" ? "busy" : "live";
}

export function toastTextOf(state: WidgetState): string {
	return state.toast?.text ?? "";
}

export function isToastVisible(state: WidgetState, nowMs: number): boolean {
	return state.toast !== null && nowMs < state.toast.untilMs;
}

/** The camera runs for the page because always scripts hold it, with or without a question. */
export function isHeldByPlugins(state: WidgetState): boolean {
	return state.presence.length > 0;
}

/** Only the camera of scripts can be paused with a click on the dot; a question has its own button. */
export function isPausable(state: WidgetState): boolean {
	return isHeldByPlugins(state) && !state.cameraOn;
}

export function isCameraBadgeVisible(state: WidgetState): boolean {
	return state.cameraOn || isHeldByPlugins(state);
}

/** The script of the question; for the camera of scripts, one name or how many there are. */
export function cameraBadgeTextOf(state: WidgetState): string {
	if (state.cameraOn) return state.pluginName;
	const { presence } = state;
	return presence.length === 1
		? (presence[0] ?? "")
		: `${presence.length} scripts`;
}

export function cameraBadgeTitleOf(state: WidgetState): string {
	if (!isPausable(state)) return "";
	return `Camera on for: ${state.presence.join(", ")}. Click to pause it until the page is reloaded.`;
}
