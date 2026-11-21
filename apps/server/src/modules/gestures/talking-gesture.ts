import type { GestureEvent } from "./types";

export interface TalkingGestureConfig {
	/** Talking must be detected this long before it counts. */
	onsetMs: number;
	/** While talking continues, the event repeats at this interval. */
	repeatMs: number;
}

export const defaultTalkingGestureConfig: TalkingGestureConfig = {
	onsetMs: 300,
	repeatMs: 1000,
};

export interface TalkingGestureState {
	talkingSinceMs: number | null;
	lastFiredAtMs: number | null;
}

export function createTalkingGestureState(): TalkingGestureState {
	return { talkingSinceMs: null, lastFiredAtMs: null };
}

export function detectTalkingGesture(
	state: TalkingGestureState,
	isTalking: boolean,
	nowMs: number,
	config: TalkingGestureConfig = defaultTalkingGestureConfig,
): { state: TalkingGestureState; events: GestureEvent[] } {
	if (!isTalking) return { state: createTalkingGestureState(), events: [] };

	const talkingSinceMs = state.talkingSinceMs ?? nowMs;
	const hasStarted = nowMs - talkingSinceMs >= config.onsetMs;
	const isDue =
		state.lastFiredAtMs === null ||
		nowMs - state.lastFiredAtMs >= config.repeatMs;

	if (!hasStarted || !isDue)
		return { state: { ...state, talkingSinceMs }, events: [] };
	return {
		state: { talkingSinceMs, lastFiredAtMs: nowMs },
		events: [{ gesture: "talking", confidence: 1 }],
	};
}
