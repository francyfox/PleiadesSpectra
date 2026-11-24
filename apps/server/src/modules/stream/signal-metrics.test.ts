import { expect, test } from "bun:test";
import { presage } from "@smartspectra/node-sdk/messages";
import { requestedMetricsFor } from "./signal-metrics";

const { MetricType } = presage.smartspectra;

const UNAVAILABLE = [
	MetricType.BREATHING_AMPLITUDE,
	MetricType.APNEA,
	MetricType.RESPIRATORY_LINE_LENGTH,
	MetricType.BASELINE,
	MetricType.INHALE_EXHALE_RATIO,
];

test("without a request only the face metrics are enabled", () => {
	const metrics = requestedMetricsFor([]);
	expect(metrics.sort()).toEqual([11, 12, 13, 14]);
	expect(requestedMetricsFor(["blink", "pose", "expression"]).sort()).toEqual(
		metrics,
	);
});

test("pulse adds the cardio rate, and only once however often it is asked for", () => {
	expect(requestedMetricsFor(["pulse"])).toContain(MetricType.PULSE_RATE);
	expect(requestedMetricsFor(["pulse"])).not.toContain(
		MetricType.BREATHING_RATE,
	);
	expect(requestedMetricsFor(["pulse", "pulse"])).toHaveLength(5);
});

test("unavailable metrics are never requested", () => {
	const metrics = requestedMetricsFor(["pulse"]);
	for (const code of UNAVAILABLE) expect(metrics).not.toContain(code);
});
