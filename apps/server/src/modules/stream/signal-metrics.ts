import type { SignalName } from "@repo/protocol";
import { presage } from "@smartspectra/node-sdk/messages";

const { MetricType } = presage.smartspectra;

/** Always requested: gestures and the `expression` signal need them. */
const FACE_METRICS: readonly number[] = [
	MetricType.FACE_LANDMARKS,
	MetricType.BLINKING,
	MetricType.TALKING,
	MetricType.EXPRESSIONS,
];

/**
 * Only the rates: HRV and the traces are not exposed as signals. Never add the unavailable metrics
 * (BREATHING_AMPLITUDE, APNEA, BASELINE, ...): `start()` fails with ConfigurationFailed.
 */
const METRICS_BY_SIGNAL: Partial<Record<SignalName, readonly number[]>> = {
	pulse: [MetricType.PULSE_RATE],
	breathing: [MetricType.BREATHING_RATE],
};

/** Face metrics plus the SDK metrics that the requested signals need; `pulse` and `breathing` are off unless asked for. */
export function requestedMetricsFor(
	signals: readonly SignalName[] = [],
): number[] {
	const extra = signals.flatMap((signal) => METRICS_BY_SIGNAL[signal] ?? []);
	return [...new Set([...FACE_METRICS, ...extra])];
}
