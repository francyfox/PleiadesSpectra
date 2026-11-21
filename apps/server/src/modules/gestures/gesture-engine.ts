import {
	createExpressionGestureState,
	detectExpressionGestures,
	type ExpressionGestureState,
} from "./expression-gestures";
import {
	createHeadGestureState,
	detectHeadGestures,
	type HeadGestureState,
	resetHeadGestureWindow,
} from "./head-gestures";
import { headPoseOf } from "./head-pose";
import {
	addRestPoseSample,
	createRestPoseState,
	poseRelativeTo,
	type RestPoseState,
} from "./rest-pose";
import {
	createTalkingGestureState,
	detectTalkingGesture,
	type TalkingGestureState,
} from "./talking-gesture";
import type { GestureEvent, GestureSignals } from "./types";

export interface GestureEngineState {
	restPose: RestPoseState;
	head: HeadGestureState;
	expression: ExpressionGestureState;
	talking: TalkingGestureState;
}

/** One engine per session: its first head poses become the neutral pose. */
export function createGestureEngineState(): GestureEngineState {
	return {
		restPose: createRestPoseState(),
		head: createHeadGestureState(),
		expression: createExpressionGestureState(),
		talking: createTalkingGestureState(),
	};
}

function stepHead(
	state: GestureEngineState,
	signals: GestureSignals,
	nowMs: number,
): { state: GestureEngineState; events: GestureEvent[] } {
	const startingHead = signals.landmarksReset
		? resetHeadGestureWindow(state.head)
		: state.head;
	const pose = signals.landmarks && headPoseOf(signals.landmarks);
	if (!pose) return { state: { ...state, head: startingHead }, events: [] };

	const restPose = addRestPoseSample(state.restPose, pose);
	if (!restPose.restPose)
		return { state: { ...state, restPose, head: startingHead }, events: [] };

	const { state: head, events } = detectHeadGestures(
		startingHead,
		poseRelativeTo(pose, restPose.restPose),
		nowMs,
	);
	return { state: { ...state, restPose, head }, events };
}

function stepExpression(
	state: GestureEngineState,
	signals: GestureSignals,
	nowMs: number,
): { state: GestureEngineState; events: GestureEvent[] } {
	if (!signals.expression) return { state, events: [] };
	const { state: expression, events } = detectExpressionGestures(
		state.expression,
		signals.expression,
		nowMs,
	);
	return { state: { ...state, expression }, events };
}

function stepTalking(
	state: GestureEngineState,
	signals: GestureSignals,
	nowMs: number,
): { state: GestureEngineState; events: GestureEvent[] } {
	if (signals.isTalking === undefined) return { state, events: [] };
	const { state: talking, events } = detectTalkingGesture(
		state.talking,
		signals.isTalking,
		nowMs,
	);
	return { state: { ...state, talking }, events };
}

/** Runs head, expression and talking detectors over one metrics packet. */
export function stepGestureEngine(
	state: GestureEngineState,
	signals: GestureSignals,
	nowMs: number,
): { state: GestureEngineState; events: GestureEvent[] } {
	const head = stepHead(state, signals, nowMs);
	const expression = stepExpression(head.state, signals, nowMs);
	const talking = stepTalking(expression.state, signals, nowMs);
	return {
		state: talking.state,
		events: [...head.events, ...expression.events, ...talking.events],
	};
}
