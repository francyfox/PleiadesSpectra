import type { ExpressionName, ExpressionScores } from "@repo/protocol";
import { presage } from "@smartspectra/node-sdk/messages";
import type { GestureSignals, Point } from "#modules/gestures/types";

const { ExpressionType } = presage.smartspectra;

const EXPRESSION_NAME_BY_TYPE: Partial<Record<number, ExpressionName>> = {
	[ExpressionType.ANGRY]: "ANGRY",
	[ExpressionType.CONTEMPT]: "CONTEMPT",
	[ExpressionType.DISGUST]: "DISGUST",
	[ExpressionType.FEAR]: "FEAR",
	[ExpressionType.HAPPY]: "HAPPY",
	[ExpressionType.NEUTRAL]: "NEUTRAL",
	[ExpressionType.SAD]: "SAD",
	[ExpressionType.SURPRISE]: "SURPRISE",
};

/**
 * The part of the decoded `Metrics` payload used here. Proto3 omits default values:
 * a `DetectionStatus` with `detected: false` arrives without the field.
 */
export interface MetricsLike {
	face?: {
		landmarks?: Array<{
			value?: Array<{ x?: number | null; y?: number | null }> | null;
			reset?: boolean | null;
		}> | null;
		expression?: Array<{
			scores?: Array<{
				type?: number | null;
				confidence?: number | null;
			}> | null;
		}> | null;
		talking?: Array<{ detected?: boolean | null }> | null;
		blinking?: DetectionLike[] | null;
	} | null;
	cardio?: { pulseRate?: MeasurementLike[] | null } | null;
}

/** `Long` from protobufjs: a 64-bit integer that does not fit a plain number type. */
export type TimestampLike =
	| number
	| bigint
	| string
	| { toNumber(): number }
	| null
	| undefined;

/** `DetectionStatus` and the `MeasurementWithConfidence` entries of the SDK payload, only the fields used here. */
export interface DetectionLike {
	detected?: boolean | null;
	timestamp?: TimestampLike;
}

export interface MeasurementLike {
	value?: number | null;
	confidence?: number | null;
	stable?: boolean | null;
	timestamp?: TimestampLike;
}

export function lastOf<T>(items: T[] | null | undefined): T | undefined {
	return items?.at(-1);
}

function expressionScoresOf(
	scores: Array<{ type?: number | null; confidence?: number | null }>,
): ExpressionScores {
	const result: ExpressionScores = {};
	for (const { type, confidence } of scores) {
		const name =
			type === null || type === undefined
				? undefined
				: EXPRESSION_NAME_BY_TYPE[type];
		if (name) result[name] = confidence ?? 0;
	}
	return result;
}

function pointsOf(
	value: Array<{ x?: number | null; y?: number | null }>,
): Point[] {
	return value.map((point) => ({ x: point.x ?? 0, y: point.y ?? 0 }));
}

/** Takes the newest entry of each repeated field: a packet may carry several samples. */
export function signalsFromMetrics(metrics: MetricsLike): GestureSignals {
	const face = metrics.face;
	const signals: GestureSignals = {};

	const landmarks = lastOf(face?.landmarks);
	if (landmarks?.value?.length) {
		signals.landmarks = pointsOf(landmarks.value);
		signals.landmarksReset = landmarks.reset === true;
	}

	const expression = lastOf(face?.expression);
	if (expression?.scores?.length)
		signals.expression = expressionScoresOf(expression.scores);

	const talking = lastOf(face?.talking);
	if (talking) signals.isTalking = talking.detected === true;

	return signals;
}
