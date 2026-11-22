import type { Gesture } from "@repo/protocol";
import type { GestureEvent, HeadPose } from "./types";

export interface HeadGestureConfig {
	windowMs: number;
	/** Peak-to-peak pitch swing of a nod, in eye distances. */
	nodAmplitude: number;
	/** Peak-to-peak yaw swing of a shake, in eye distances. */
	shakeAmplitude: number;
	/** Direction reversals inside the window that make a swing an oscillation rather than a single move. */
	minReversals: number;
	/** Smoothed pitch offset from the rest pose at which a tilt starts. */
	tiltOffset: number;
	/** A started tilt lasts until the smoothed offset falls below this, so jitter near `tiltOffset` does not end it. */
	tiltReleaseOffset: number;
	/** Looking down moves the nose less in the image than looking up (measured: 0.2 against 0.38), so down needs this share of the offsets. */
	tiltDownShare: number;
	/** Time constant of the pitch smoothing used by tilt, in ms. */
	tiltSmoothingMs: number;
	/** A head turned more than this many eye distances from the rest pose gives no valid pitch, so no tilt. */
	tiltMaxYaw: number;
	/** How slowly the neutral pitch follows a changed posture, in ms. Only offsets below `tiltOffset` are followed. */
	tiltBaselineMs: number;
	tiltHoldMs: number;
	/** Roll away from the rest pose that counts as a lean to a shoulder, in radians (0.17 is about 10°). */
	rollOffset: number;
	rollHoldMs: number;
	/** While tilted, the event repeats at this interval (for scrolling). */
	tiltRepeatMs: number;
	cooldownMs: number;
}

export const defaultHeadGestureConfig: HeadGestureConfig = {
	windowMs: 1200,
	nodAmplitude: 0.1,
	shakeAmplitude: 0.18,
	minReversals: 2,
	tiltOffset: 0.12,
	tiltReleaseOffset: 0.06,
	tiltDownShare: 0.65,
	tiltSmoothingMs: 150,
	tiltBaselineMs: 15000,
	tiltMaxYaw: 0.3,
	tiltHoldMs: 400,
	rollOffset: 0.17,
	rollHoldMs: 250,
	tiltRepeatMs: 600,
	cooldownMs: 900,
};

interface PoseSample {
	timeMs: number;
	pose: HeadPose;
}

export interface HeadGestureState {
	window: PoseSample[];
	lastFiredAtMs: Partial<Record<Gesture, number>>;
	tiltedSinceMs: number | null;
	/** Pitch after exponential smoothing; tilt reads this, nod and shake read the raw pitch. */
	smoothedPitch: number | null;
	/** How far the neutral pitch has moved from the rest pose, as the head settled into another posture. */
	pitchBaseline: number;
	lastPoseMs: number | null;
	/** When the head started leaning to a shoulder; null while upright. */
	leanedSinceMs: number | null;
	/** A lean fires once, and the head has to come back upright before the next one can. */
	leanFired: boolean;
}

export function createHeadGestureState(): HeadGestureState {
	return {
		window: [],
		lastFiredAtMs: {},
		tiltedSinceMs: null,
		smoothedPitch: null,
		pitchBaseline: 0,
		lastPoseMs: null,
		leanedSinceMs: null,
		leanFired: false,
	};
}

export function resetHeadGestureWindow(
	state: HeadGestureState,
): HeadGestureState {
	return {
		...state,
		window: [],
		tiltedSinceMs: null,
		smoothedPitch: null,
		pitchBaseline: 0,
		lastPoseMs: null,
		leanedSinceMs: null,
		leanFired: false,
	};
}

function trimWindow(
	samples: PoseSample[],
	nowMs: number,
	windowMs: number,
): PoseSample[] {
	return samples.filter((sample) => nowMs - sample.timeMs <= windowMs);
}

function peakToPeak(values: number[]): number {
	return Math.max(...values) - Math.min(...values);
}

/** Counts how often the signal turns around after moving more than `minStep` since the last turn. */
function countReversals(values: number[], minStep: number): number {
	let reversals = 0;
	let direction = 0;
	let extreme = values[0] ?? 0;

	for (const value of values) {
		const delta = value - extreme;
		if (direction >= 0 && delta < -minStep) {
			if (direction === 1) reversals++;
			direction = -1;
			extreme = value;
		} else if (direction <= 0 && delta > minStep) {
			if (direction === -1) reversals++;
			direction = 1;
			extreme = value;
		} else if (direction === 1 ? value > extreme : value < extreme) {
			extreme = value;
		}
	}
	return reversals;
}

function isOffCooldown(
	state: HeadGestureState,
	gesture: Gesture,
	nowMs: number,
	cooldownMs: number,
): boolean {
	const lastFiredAtMs = state.lastFiredAtMs[gesture];
	return lastFiredAtMs === undefined || nowMs - lastFiredAtMs >= cooldownMs;
}

function oscillationConfidence(amplitude: number, threshold: number): number {
	return Math.min(1, amplitude / (threshold * 2));
}

interface Oscillation {
	gesture: "nod" | "shake";
	amplitude: number;
	threshold: number;
}

/** A nod swings pitch and keeps yaw quiet; a shake does the opposite. */
function detectOscillation(
	window: PoseSample[],
	config: HeadGestureConfig,
): Oscillation | null {
	if (window.length < 4) return null;

	const pitches = window.map((sample) => sample.pose.pitch);
	const yaws = window.map((sample) => sample.pose.yaw);
	const pitchSwing = peakToPeak(pitches);
	const yawSwing = peakToPeak(yaws);

	const nodScore = pitchSwing / config.nodAmplitude;
	const shakeScore = yawSwing / config.shakeAmplitude;
	const isNod =
		nodScore >= 1 &&
		nodScore > shakeScore &&
		countReversals(pitches, config.nodAmplitude / 3) >= config.minReversals;
	const isShake =
		shakeScore >= 1 &&
		shakeScore > nodScore &&
		countReversals(yaws, config.shakeAmplitude / 3) >= config.minReversals;

	if (isNod)
		return {
			gesture: "nod",
			amplitude: pitchSwing,
			threshold: config.nodAmplitude,
		};
	if (isShake)
		return {
			gesture: "shake",
			amplitude: yawSwing,
			threshold: config.shakeAmplitude,
		};
	return null;
}

function fire(
	state: HeadGestureState,
	event: GestureEvent,
	nowMs: number,
): { state: HeadGestureState; events: GestureEvent[] } {
	return {
		state: {
			...state,
			window: [],
			lastFiredAtMs: { ...state.lastFiredAtMs, [event.gesture]: nowMs },
		},
		events: [event],
	};
}

function weightOver(elapsedMs: number, timeConstantMs: number): number {
	return 1 - Math.exp(-elapsedMs / timeConstantMs);
}

/**
 * Pitch relative to the neutral pose, smoothed over time so the result does not depend on the frame rate.
 * The neutral pose follows a slow change of posture (leaning back in the chair), but never an offset that is
 * already a tilt, so a held tilt is not taken for the new neutral.
 */
function smoothPitch(
	state: HeadGestureState,
	pitch: number,
	nowMs: number,
	config: HeadGestureConfig,
): HeadGestureState {
	const { smoothedPitch, lastPoseMs } = state;
	if (smoothedPitch === null || lastPoseMs === null)
		return { ...state, smoothedPitch: pitch, lastPoseMs: nowMs };

	const elapsedMs = nowMs - lastPoseMs;
	const smoothed =
		smoothedPitch +
		(pitch - smoothedPitch) * weightOver(elapsedMs, config.tiltSmoothingMs);
	const offset = smoothed - state.pitchBaseline;
	const isDrifting =
		state.tiltedSinceMs === null &&
		Math.abs(offset) < tiltStartOffset(offset, config);
	const pitchBaseline = isDrifting
		? state.pitchBaseline +
			offset * weightOver(elapsedMs, config.tiltBaselineMs)
		: state.pitchBaseline;
	return {
		...state,
		smoothedPitch: smoothed,
		pitchBaseline,
		lastPoseMs: nowMs,
	};
}

/** Positive pitch is down, which has the lower threshold. */
function directionShare(
	pitchOffset: number,
	config: HeadGestureConfig,
): number {
	return pitchOffset > 0 ? config.tiltDownShare : 1;
}

function tiltStartOffset(
	pitchOffset: number,
	config: HeadGestureConfig,
): number {
	return config.tiltOffset * directionShare(pitchOffset, config);
}

/** Whether the offset starts a tilt, or keeps one going: a started tilt has the lower release threshold. */
function isTilted(
	pitchOffset: number,
	wasTilted: boolean,
	config: HeadGestureConfig,
): boolean {
	const threshold = wasTilted
		? config.tiltReleaseOffset * directionShare(pitchOffset, config)
		: tiltStartOffset(pitchOffset, config);
	return Math.abs(pitchOffset) >= threshold;
}

/** Sustained pitch away from rest: down scrolls down, up scrolls up; repeats while held. */
function detectTilt(
	state: HeadGestureState,
	pitchOffset: number,
	nowMs: number,
	config: HeadGestureConfig,
): { state: HeadGestureState; events: GestureEvent[] } {
	if (!isTilted(pitchOffset, state.tiltedSinceMs !== null, config))
		return { state: { ...state, tiltedSinceMs: null }, events: [] };

	const tiltedSinceMs = state.tiltedSinceMs ?? nowMs;
	const heldState = { ...state, tiltedSinceMs };
	if (nowMs - tiltedSinceMs < config.tiltHoldMs)
		return { state: heldState, events: [] };

	const gesture: Gesture = pitchOffset > 0 ? "tilt-down" : "tilt-up";
	if (!isOffCooldown(state, gesture, nowMs, config.tiltRepeatMs))
		return { state: heldState, events: [] };

	const confidence = Math.min(
		1,
		Math.abs(pitchOffset) / (tiltStartOffset(pitchOffset, config) * 2),
	);
	return {
		state: {
			...heldState,
			lastFiredAtMs: { ...state.lastFiredAtMs, [gesture]: nowMs },
		},
		events: [{ gesture, confidence }],
	};
}

/**
 * A lean to a shoulder held for a moment is one event, not a repeating one: it is for actions (open, switch), and a
 * head that stays leaned does not fire again until it has been upright. Coming back counts from half the offset.
 */
function detectLean(
	state: HeadGestureState,
	rollOffset: number,
	nowMs: number,
	config: HeadGestureConfig,
): { state: HeadGestureState; events: GestureEvent[] } {
	const amount = Math.abs(rollOffset);
	if (amount < config.rollOffset / 2)
		return {
			state: { ...state, leanedSinceMs: null, leanFired: false },
			events: [],
		};
	if (amount < config.rollOffset || state.leanFired)
		return { state, events: [] };

	const leanedSinceMs = state.leanedSinceMs ?? nowMs;
	if (nowMs - leanedSinceMs < config.rollHoldMs)
		return { state: { ...state, leanedSinceMs }, events: [] };

	const gesture: Gesture = rollOffset > 0 ? "roll-left" : "roll-right";
	if (!isOffCooldown(state, gesture, nowMs, config.cooldownMs))
		return { state: { ...state, leanedSinceMs }, events: [] };

	return {
		state: {
			...state,
			leanedSinceMs,
			leanFired: true,
			lastFiredAtMs: { ...state.lastFiredAtMs, [gesture]: nowMs },
		},
		events: [
			{ gesture, confidence: Math.min(1, amount / (config.rollOffset * 2)) },
		],
	};
}

/**
 * Feeds one pose (relative to the rest pose) and returns the gestures it completes.
 * Nod and shake are quick oscillations; tilt is a held offset, so a held tilt never reads as a nod.
 * A lean to a shoulder (roll) is its own axis and is checked first, so a head that leans is not also a tilt.
 */
export function detectHeadGestures(
	state: HeadGestureState,
	pose: HeadPose,
	nowMs: number,
	config: HeadGestureConfig = defaultHeadGestureConfig,
): { state: HeadGestureState; events: GestureEvent[] } {
	const window = trimWindow(
		[...state.window, { timeMs: nowMs, pose }],
		nowMs,
		config.windowMs,
	);
	const next = smoothPitch({ ...state, window }, pose.pitch, nowMs, config);

	const oscillation = detectOscillation(window, config);
	if (
		oscillation &&
		isOffCooldown(next, oscillation.gesture, nowMs, config.cooldownMs)
	) {
		return fire(
			next,
			{
				gesture: oscillation.gesture,
				confidence: oscillationConfidence(
					oscillation.amplitude,
					oscillation.threshold,
				),
			},
			nowMs,
		);
	}

	const isOscillating = oscillation !== null;
	if (isOscillating)
		return { state: { ...next, tiltedSinceMs: null }, events: [] };

	const lean = detectLean(next, pose.roll, nowMs, config);
	if (lean.events.length > 0) return lean;
	if (Math.abs(pose.yaw) > config.tiltMaxYaw)
		return { state: { ...lean.state, tiltedSinceMs: null }, events: [] };
	return detectTilt(
		lean.state,
		(next.smoothedPitch ?? pose.pitch) - next.pitchBaseline,
		nowMs,
		config,
	);
}
