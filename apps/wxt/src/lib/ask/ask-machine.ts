import type {
	AskAnswer,
	AskOption,
	WidgetPosition,
	WidgetSize,
} from "@repo/protocol";
import type { ExpressionScores } from "../emotion";
import type { WidgetMessage } from "../messages";

export const CAMERA_READY_TIMEOUT_MS = 20_000;
/** After a timeout or "Turn off camera" the user can still answer with the mouse for this long. */
export const MOUSE_GRACE_MS = 30_000;
export const ACCEPTED_HIDE_DELAY_MS = 1500;
export const ERROR_HIDE_DELAY_MS = 4000;

export interface AskRequest {
	pluginName: string;
	question: string;
	options: AskOption[];
	timeoutMs: number;
	/** Where and how big the widget is for this question; missing means the defaults. */
	position?: WidgetPosition;
	size?: WidgetSize;
}

export type AskPhase =
	| "idle"
	| "checking-server"
	| "warmup"
	| "listening"
	| "awaiting-click";

export interface AskState {
	phase: AskPhase;
	request: AskRequest | null;
}

export type TimerName = "ready" | "answer" | "grace" | "hide";

export type AskEvent =
	| { type: "ask-requested"; request: AskRequest }
	| { type: "server-checked"; online: boolean }
	| { type: "ready" }
	| { type: "expression"; scores: ExpressionScores }
	| { type: "validation"; hint: string }
	| { type: "gesture"; gesture: string }
	| { type: "option-clicked"; value: string }
	| { type: "camera-off-clicked" }
	/** The page that asked is gone or moved on: nobody is there to answer. */
	| { type: "page-gone" }
	| { type: "link-failed"; message: string }
	| { type: "timer-fired"; timer: TimerName };

export type AskEffect =
	| { type: "check-server" }
	| { type: "widget"; message: WidgetMessage }
	| { type: "start-camera" }
	| { type: "stop-camera" }
	| { type: "set-timer"; timer: TimerName; ms: number }
	| { type: "clear-timers" }
	| { type: "reply"; answer: AskAnswer };

export interface AskStep {
	state: AskState;
	effects: AskEffect[];
}

export const idleState: AskState = { phase: "idle", request: null };

const hasPhase = (state: AskState, ...phases: AskPhase[]): boolean =>
	phases.includes(state.phase);

const ignore = (state: AskState): AskStep => ({ state, effects: [] });

function toWidgetOptions(request: AskRequest): WidgetMessage {
	return {
		type: "widget/ask",
		pluginName: request.pluginName,
		question: request.question,
		options: request.options,
		position: request.position,
		size: request.size,
	};
}

function findOption(request: AskRequest | null, value: string) {
	return request?.options.find((option) => option.value === value);
}

function finishAnswered(answer: AskAnswer): AskStep {
	return {
		state: idleState,
		effects: [
			{ type: "stop-camera" },
			{ type: "clear-timers" },
			{ type: "widget", message: { type: "widget/accepted", value: answer } },
			{ type: "reply", answer },
			{ type: "set-timer", timer: "hide", ms: ACCEPTED_HIDE_DELAY_MS },
		],
	};
}

function finishFailed(hint: string): AskStep {
	return {
		state: idleState,
		effects: [
			{ type: "stop-camera" },
			{ type: "clear-timers" },
			{ type: "widget", message: { type: "widget/error", hint } },
			{ type: "reply", answer: "timeout" },
			{ type: "set-timer", timer: "hide", ms: ERROR_HIDE_DELAY_MS },
		],
	};
}

function awaitMouseAnswer(state: AskState): AskStep {
	return {
		state: { ...state, phase: "awaiting-click" },
		effects: [
			{ type: "stop-camera" },
			{ type: "clear-timers" },
			{ type: "widget", message: { type: "widget/timeout" } },
			{ type: "set-timer", timer: "grace", ms: MOUSE_GRACE_MS },
		],
	};
}

function onAskRequested(state: AskState, request: AskRequest): AskStep {
	if (state.phase !== "idle") return ignore(state);
	return {
		state: { phase: "checking-server", request },
		effects: [
			{ type: "clear-timers" },
			{ type: "widget", message: toWidgetOptions(request) },
			{ type: "check-server" },
		],
	};
}

function onServerChecked(state: AskState, online: boolean): AskStep {
	if (state.phase !== "checking-server") return ignore(state);
	if (!online) return finishFailed("Server is offline");
	return {
		state: { ...state, phase: "warmup" },
		effects: [
			{ type: "start-camera" },
			{ type: "set-timer", timer: "ready", ms: CAMERA_READY_TIMEOUT_MS },
		],
	};
}

function onReady(state: AskState): AskStep {
	if (state.phase !== "warmup" || !state.request) return ignore(state);
	const { timeoutMs } = state.request;
	return {
		state: { ...state, phase: "listening" },
		effects: [
			{ type: "set-timer", timer: "answer", ms: timeoutMs },
			{ type: "widget", message: { type: "widget/listening", timeoutMs } },
		],
	};
}

function onExpression(state: AskState, scores: ExpressionScores): AskStep {
	if (state.phase !== "listening") return ignore(state);
	return {
		state,
		effects: [
			{ type: "widget", message: { type: "widget/expression", scores } },
		],
	};
}

function onValidation(state: AskState, hint: string): AskStep {
	if (!hasPhase(state, "warmup", "listening")) return ignore(state);
	return {
		state,
		effects: [{ type: "widget", message: { type: "widget/hint", hint } }],
	};
}

/**
 * Every gesture the camera sees while the widget is open makes Beta strike a pose; only a gesture the script
 * listed in `options` answers the question.
 */
function onGesture(state: AskState, gesture: string): AskStep {
	if (!hasPhase(state, "warmup", "listening")) return ignore(state);
	const pose: AskEffect = {
		type: "widget",
		message: { type: "widget/gesture", gesture },
	};
	const option = findOption(state.request, gesture);
	if (state.phase !== "listening" || !option) return { state, effects: [pose] };
	const answered = finishAnswered(option.value);
	return { ...answered, effects: [pose, ...answered.effects] };
}

/** A mouse click answers in any phase where the buttons are on screen. */
function onOptionClicked(state: AskState, value: string): AskStep {
	const option = findOption(state.request, value);
	const buttonsVisible = hasPhase(
		state,
		"checking-server",
		"warmup",
		"listening",
		"awaiting-click",
	);
	if (!buttonsVisible || !option) return ignore(state);
	return finishAnswered(option.value);
}

function onCameraOffClicked(state: AskState): AskStep {
	if (!hasPhase(state, "warmup", "listening")) return ignore(state);
	return awaitMouseAnswer(state);
}

function onPageGone(state: AskState): AskStep {
	if (state.phase === "idle") return ignore(state);
	return {
		state: idleState,
		effects: [
			{ type: "stop-camera" },
			{ type: "clear-timers" },
			/** In a single-page app the page is still there, and its widget must not stay on the screen. */
			{ type: "widget", message: { type: "widget/hide" } },
			{ type: "reply", answer: "timeout" },
		],
	};
}

function onLinkFailed(state: AskState, message: string): AskStep {
	if (!hasPhase(state, "checking-server", "warmup", "listening"))
		return ignore(state);
	return finishFailed(message);
}

function onTimerFired(state: AskState, timer: TimerName): AskStep {
	switch (timer) {
		case "ready":
			return state.phase === "warmup"
				? finishFailed("The camera took too long to start")
				: ignore(state);
		case "answer":
			return state.phase === "listening"
				? awaitMouseAnswer(state)
				: ignore(state);
		case "grace":
			return state.phase === "awaiting-click"
				? {
						state: idleState,
						effects: [
							{ type: "clear-timers" },
							{ type: "widget", message: { type: "widget/hide" } },
							{ type: "reply", answer: "timeout" },
						],
					}
				: ignore(state);
		case "hide":
			return state.phase === "idle"
				? {
						state,
						effects: [{ type: "widget", message: { type: "widget/hide" } }],
					}
				: ignore(state);
	}
}

/** Pure `ask` flow: an event goes in, the next state and the side effects to run come out. */
export function reduceAsk(state: AskState, event: AskEvent): AskStep {
	switch (event.type) {
		case "ask-requested":
			return onAskRequested(state, event.request);
		case "server-checked":
			return onServerChecked(state, event.online);
		case "ready":
			return onReady(state);
		case "expression":
			return onExpression(state, event.scores);
		case "validation":
			return onValidation(state, event.hint);
		case "gesture":
			return onGesture(state, event.gesture);
		case "option-clicked":
			return onOptionClicked(state, event.value);
		case "camera-off-clicked":
			return onCameraOffClicked(state);
		case "page-gone":
			return onPageGone(state);
		case "link-failed":
			return onLinkFailed(state, event.message);
		case "timer-fired":
			return onTimerFired(state, event.timer);
	}
}
