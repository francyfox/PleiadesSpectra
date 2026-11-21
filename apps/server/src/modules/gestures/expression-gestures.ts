import type { ExpressionName, ExpressionScores } from "@repo/protocol";
import type { GestureEvent } from "./types";

export interface ExpressionGestureConfig {
	/** Weight of the newest packet in the moving average (0–1). */
	smoothing: number;
	smileThreshold: number;
	confusedThreshold: number;
	/** Consecutive packets above the threshold before the gesture fires (~30 packets per second). */
	holdPackets: number;
	cooldownMs: number;
}

export const defaultExpressionGestureConfig: ExpressionGestureConfig = {
	smoothing: 0.3,
	smileThreshold: 55,
	confusedThreshold: 60,
	holdPackets: 6,
	cooldownMs: 1000,
};

/** Negative-ish expressions that read as puzzlement; SmartSpectra has no dedicated "confused". */
const CONFUSED_EXPRESSIONS: readonly ExpressionName[] = [
	"ANGRY",
	"CONTEMPT",
	"DISGUST",
	"FEAR",
	"SAD",
];

export interface ExpressionGestureState {
	smoothedHappy: number;
	smoothedConfused: number;
	smileStreak: number;
	confusedStreak: number;
	lastSmileAtMs: number | null;
	lastConfusedAtMs: number | null;
}

export function createExpressionGestureState(): ExpressionGestureState {
	return {
		smoothedHappy: 0,
		smoothedConfused: 0,
		smileStreak: 0,
		confusedStreak: 0,
		lastSmileAtMs: null,
		lastConfusedAtMs: null,
	};
}

function smooth(previous: number, next: number, weight: number): number {
	return previous + (next - previous) * weight;
}

function strongestConfusedScore(scores: ExpressionScores): number {
	return Math.max(0, ...CONFUSED_EXPRESSIONS.map((name) => scores[name] ?? 0));
}

function isOffCooldown(
	lastAtMs: number | null,
	nowMs: number,
	cooldownMs: number,
): boolean {
	return lastAtMs === null || nowMs - lastAtMs >= cooldownMs;
}

function confidenceOf(score: number, threshold: number): number {
	return Math.min(1, score / 100) * (score >= threshold ? 1 : 0);
}

/** Smoothed scores must stay above the threshold for `holdPackets` packets: single noisy packets do not fire. */
export function detectExpressionGestures(
	state: ExpressionGestureState,
	scores: ExpressionScores,
	nowMs: number,
	config: ExpressionGestureConfig = defaultExpressionGestureConfig,
): { state: ExpressionGestureState; events: GestureEvent[] } {
	const smoothedHappy = smooth(
		state.smoothedHappy,
		scores.HAPPY ?? 0,
		config.smoothing,
	);
	const smoothedConfused = smooth(
		state.smoothedConfused,
		strongestConfusedScore(scores),
		config.smoothing,
	);
	const smileStreak =
		smoothedHappy >= config.smileThreshold ? state.smileStreak + 1 : 0;
	const confusedStreak =
		smoothedConfused >= config.confusedThreshold ? state.confusedStreak + 1 : 0;

	const events: GestureEvent[] = [];
	let lastSmileAtMs = state.lastSmileAtMs;
	let lastConfusedAtMs = state.lastConfusedAtMs;

	if (
		smileStreak >= config.holdPackets &&
		isOffCooldown(lastSmileAtMs, nowMs, config.cooldownMs)
	) {
		events.push({
			gesture: "smile",
			confidence: confidenceOf(smoothedHappy, config.smileThreshold),
		});
		lastSmileAtMs = nowMs;
	}
	if (
		confusedStreak >= config.holdPackets &&
		isOffCooldown(lastConfusedAtMs, nowMs, config.cooldownMs)
	) {
		events.push({
			gesture: "confused",
			confidence: confidenceOf(smoothedConfused, config.confusedThreshold),
		});
		lastConfusedAtMs = nowMs;
	}

	return {
		state: {
			smoothedHappy,
			smoothedConfused,
			smileStreak,
			confusedStreak,
			lastSmileAtMs,
			lastConfusedAtMs,
		},
		events,
	};
}
