import type { CameraEvent } from "../camera/camera-events";
import { trackExpression } from "../emotion";
import type { CheckState, CheckView } from "./check.model";

export type CheckInput =
	| { kind: "started" }
	| { kind: "stopped" }
	| { kind: "blocked"; reason: string }
	| { kind: "camera"; event: CameraEvent };

export function createIdleCheckState(): CheckState {
	return {
		status: "idle",
		tracker: { emotion: "neutral", changedAt: 0 },
		hint: "",
		reason: "",
	};
}

function isActive(state: CheckState): boolean {
	return state.status === "starting" || state.status === "running";
}

function blocked(state: CheckState, reason: string): CheckState {
	return { ...state, status: "blocked", hint: "", reason };
}

function reduceCameraEvent(
	state: CheckState,
	event: CameraEvent,
	nowMs: number,
): CheckState {
	if (!isActive(state)) return state;
	if (event.kind === "failed") return blocked(state, event.message);
	if (event.kind === "lost")
		return blocked(state, "The connection to the server was lost");
	if (event.kind === "quality") return { ...state, hint: event.hint };

	const { message } = event;
	switch (message.type) {
		case "ready":
			return {
				...state,
				status: "running",
				tracker: { emotion: "neutral", changedAt: nowMs },
			};
		case "expression":
			return {
				...state,
				tracker: trackExpression(state.tracker, message.scores, nowMs),
			};
		case "validation":
			return { ...state, hint: message.hint };
		case "error":
			return blocked(state, message.message);
		case "gesture":
		case "metrics":
		case "signal":
		case "mask":
			return state;
	}
}

/** One step of a Spectra check; any error from the camera or the server ends in the blocked state. */
export function reduceCheck(
	state: CheckState,
	input: CheckInput,
	nowMs: number,
): CheckState {
	switch (input.kind) {
		case "started":
			return {
				status: "starting",
				tracker: { emotion: "focused", changedAt: nowMs },
				hint: "",
				reason: "",
			};
		case "stopped":
			return createIdleCheckState();
		case "blocked":
			return blocked(state, input.reason);
		case "camera":
			return reduceCameraEvent(state, input.event, nowMs);
	}
}

export function toCheckView(state: CheckState): CheckView {
	const isShowingEmotion =
		state.status === "starting" || state.status === "running";
	return {
		status: state.status,
		emotion: isShowingEmotion ? state.tracker.emotion : "neutral",
		hint: state.hint,
		reason: state.reason,
	};
}

export function isSameView(a: CheckView, b: CheckView): boolean {
	return (
		a.status === b.status &&
		a.emotion === b.emotion &&
		a.hint === b.hint &&
		a.reason === b.reason
	);
}

function topExpression(scores: Record<string, number | undefined>): string {
	const [name, score] = Object.entries(scores)
		.filter((entry): entry is [string, number] => entry[1] !== undefined)
		.sort((a, b) => b[1] - a[1])[0] ?? ["none", 0];
	return `${name} ${Math.round(score)}`;
}

/**
 * What the raw SDK payload shows in the log of a check: the expressions and nothing else. The session may be shared
 * with scripts that read blinks, talking and pulse; the check is about emotions only.
 */
export function expressionsOnly(metrics: unknown): unknown {
	const expression = (metrics as { face?: { expression?: unknown } } | null)
		?.face?.expression;
	return { face: { expression } };
}

/**
 * One line per event or answer from Spectra; null for events that are not worth a line. Gestures and signals belong to
 * the scripts that asked for them, so they are not here.
 */
export function describeEvent(event: CameraEvent): string | null {
	if (event.kind === "failed")
		return `camera failed (${event.reason}): ${event.message}`;
	if (event.kind === "lost") return "server connection lost";
	if (event.kind === "quality")
		return event.hint ? `camera quality: ${event.hint}` : "camera quality: ok";

	const { message } = event;
	switch (message.type) {
		case "ready":
			return "ready";
		case "expression":
			return `expression ${topExpression(message.scores)}`;
		case "metrics":
			return "metrics (expressions only)";
		case "signal":
		case "gesture":
		case "mask":
			return null;
		case "validation":
			return `validation ${message.hint} (code ${message.code})`;
		case "error":
			return `error ${message.message}${message.retryable ? " (retryable)" : ""}`;
	}
}

/** Failures of the camera, the connection or Spectra itself; the console shows them as warnings. */
export function isErrorEvent(event: CameraEvent): boolean {
	if (event.kind === "quality") return false;
	if (event.kind !== "server") return true;
	return event.message.type === "error";
}
