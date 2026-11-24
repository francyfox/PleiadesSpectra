import type { SignalName, SignalSample, SignalValues } from "@repo/protocol";
import { headPoseOf } from "#modules/gestures/head-pose";
import {
	addRestPoseSample,
	createRestPoseState,
	poseRelativeTo,
	type RestPoseState,
} from "#modules/gestures/rest-pose";
import type { GestureSignals } from "#modules/gestures/types";
import {
	lastOf,
	type MeasurementLike,
	type MetricsLike,
	type TimestampLike,
} from "./signals";

export const POSE_INTERVAL_MS = 1000 / 15;
export const EXPRESSION_INTERVAL_MS = 100;

/** What the emitter remembers between metrics packets: throttles, the rest pose and the last value of each signal. */
export interface SignalEmitterState {
	requested: ReadonlySet<SignalName>;
	restPose: RestPoseState;
	lastPoseAtMs: number;
	lastExpressionAtMs: number;
	lastBlink: boolean | null;
	lastPulseAtMs: number | null;
}

export interface EmitterStep {
	state: SignalEmitterState;
	samples: SignalSample[];
}

/** One emitter per session; it only produces the signals the client asked for in `start.signals`. */
export function createSignalEmitterState(
	requested: readonly SignalName[] = [],
): SignalEmitterState {
	return {
		requested: new Set(requested),
		restPose: createRestPoseState(),
		lastPoseAtMs: Number.NEGATIVE_INFINITY,
		lastExpressionAtMs: Number.NEGATIVE_INFINITY,
		lastBlink: null,
		lastPulseAtMs: null,
	};
}

function sampleOf<Name extends SignalName>(
	signal: Name,
	value: SignalValues[Name],
	at: number,
): SignalSample {
	return { signal, value, at } as SignalSample;
}

/** SDK timestamps are microseconds since the epoch; scripts get milliseconds. */
export function timestampToMs(timestamp: TimestampLike): number | null {
	if (timestamp === null || timestamp === undefined) return null;
	const microseconds =
		typeof timestamp === "object" ? timestamp.toNumber() : Number(timestamp);
	if (!Number.isFinite(microseconds) || microseconds <= 0) return null;
	return Math.floor(microseconds / 1000);
}

function stepPose(
	state: SignalEmitterState,
	signals: GestureSignals,
	nowMs: number,
): EmitterStep {
	const pose = signals.landmarks && headPoseOf(signals.landmarks);
	if (!state.requested.has("pose") || !pose) return { state, samples: [] };

	const restPose = addRestPoseSample(state.restPose, pose);
	const next = { ...state, restPose };
	if (!restPose.restPose) return { state: next, samples: [] };
	if (nowMs - state.lastPoseAtMs < POSE_INTERVAL_MS)
		return { state: next, samples: [] };

	const relative = poseRelativeTo(pose, restPose.restPose);
	return {
		state: { ...next, lastPoseAtMs: nowMs },
		samples: [sampleOf("pose", relative, nowMs)],
	};
}

function stepExpression(
	state: SignalEmitterState,
	signals: GestureSignals,
	nowMs: number,
): EmitterStep {
	if (!state.requested.has("expression") || !signals.expression)
		return { state, samples: [] };
	if (nowMs - state.lastExpressionAtMs < EXPRESSION_INTERVAL_MS)
		return { state, samples: [] };

	return {
		state: { ...state, lastExpressionAtMs: nowMs },
		samples: [sampleOf("expression", signals.expression, nowMs)],
	};
}

/** Proto3 omits `detected: false`, so a missing field is `false`; only a change is sent. */
function stepBlink(
	state: SignalEmitterState,
	metrics: MetricsLike,
	nowMs: number,
): EmitterStep {
	const blinking = lastOf(metrics.face?.blinking);
	if (!state.requested.has("blink") || !blinking) return { state, samples: [] };

	const detected = blinking.detected === true;
	if (detected === state.lastBlink) return { state, samples: [] };

	const at = timestampToMs(blinking.timestamp) ?? nowMs;
	return {
		state: { ...state, lastBlink: detected },
		samples: [sampleOf("blink", { detected }, at)],
	};
}

function measurementValue(
	measurement: MeasurementLike,
): ({ confidence: number; stable: boolean } & { value: number }) | null {
	if (typeof measurement.value !== "number") return null;
	return {
		value: measurement.value,
		confidence: measurement.confidence ?? 0,
		stable: measurement.stable === true,
	};
}

interface RateStep {
	lastAtMs: number | null;
	sample: SignalSample | null;
}

/** A packet may repeat the previous sample, so a rate is sent only when its SDK timestamp is new. */
function stepRate(
	measurements: MeasurementLike[] | null | undefined,
	lastAtMs: number | null,
	nowMs: number,
): RateStep {
	const latest = lastOf(measurements);
	const reading = latest && measurementValue(latest);
	if (!latest || !reading) return { lastAtMs, sample: null };

	const at = timestampToMs(latest.timestamp) ?? nowMs;
	if (at === lastAtMs) return { lastAtMs, sample: null };

	const { value, confidence, stable } = reading;
	const sample = sampleOf("pulse", { bpm: value, confidence, stable }, at);
	return { lastAtMs: at, sample };
}

function stepPulse(
	state: SignalEmitterState,
	metrics: MetricsLike,
	nowMs: number,
): EmitterStep {
	if (!state.requested.has("pulse")) return { state, samples: [] };
	const step = stepRate(metrics.cardio?.pulseRate, state.lastPulseAtMs, nowMs);
	return {
		state: { ...state, lastPulseAtMs: step.lastAtMs },
		samples: step.sample ? [step.sample] : [],
	};
}

/** Turns one metrics packet into the samples of the requested signals. */
export function stepSignalEmitter(
	state: SignalEmitterState,
	metrics: MetricsLike,
	signals: GestureSignals,
	nowMs: number,
): EmitterStep {
	const steps = [
		(current: SignalEmitterState) => stepBlink(current, metrics, nowMs),
		(current: SignalEmitterState) => stepPose(current, signals, nowMs),
		(current: SignalEmitterState) => stepExpression(current, signals, nowMs),
		(current: SignalEmitterState) => stepPulse(current, metrics, nowMs),
	];

	let current = state;
	const samples: SignalSample[] = [];
	for (const step of steps) {
		const result = step(current);
		current = result.state;
		samples.push(...result.samples);
	}
	return { state: current, samples };
}
