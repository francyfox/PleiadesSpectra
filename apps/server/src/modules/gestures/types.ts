import type { ExpressionScores, Gesture } from "@repo/protocol";

export interface Point {
	x: number;
	y: number;
}

/**
 * Head orientation proxies: yaw grows to the image right, pitch grows downward (both in eye-distance units),
 * roll is the angle of the eye line in radians and grows when the head leans to the person's own left shoulder.
 */
export interface HeadPose {
	yaw: number;
	pitch: number;
	roll: number;
}

export interface GestureEvent {
	gesture: Gesture;
	/** 0–1: how far past the threshold the gesture was. */
	confidence: number;
}

/** What one metrics packet carries for gesture detection; every field is optional because packets are sparse. */
export interface GestureSignals {
	landmarks?: Point[];
	/** The landmark set was reset: it cannot be compared with the previous one. */
	landmarksReset?: boolean;
	expression?: ExpressionScores;
	isTalking?: boolean;
}
