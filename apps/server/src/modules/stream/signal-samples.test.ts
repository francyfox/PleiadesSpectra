import { describe, expect, test } from "bun:test";
import type { SignalName } from "@repo/protocol";
import { REST_POSE_SAMPLES } from "#modules/gestures/rest-pose";
import { syntheticLandmarks } from "#modules/gestures/test-helpers";
import {
	createSignalEmitterState,
	POSE_INTERVAL_MS,
	stepSignalEmitter,
	timestampToMs,
} from "./signal-samples";
import { type MetricsLike, signalsFromMetrics } from "./signals";

function run(
	requested: SignalName[],
	packets: Array<{ metrics: MetricsLike; nowMs: number }>,
) {
	let state = createSignalEmitterState(requested);
	return packets.flatMap(({ metrics, nowMs }) => {
		const step = stepSignalEmitter(
			state,
			metrics,
			signalsFromMetrics(metrics),
			nowMs,
		);
		state = step.state;
		return step.samples;
	});
}

const at = (metrics: MetricsLike, nowMs = 1000) => [{ metrics, nowMs }];

describe("blink", () => {
	test("a missing `detected` is false and only changes are sent, with the SDK timestamp", () => {
		const samples = run(
			["blink"],
			[
				{ metrics: { face: { blinking: [{}] } }, nowMs: 1 },
				{ metrics: { face: { blinking: [{}] } }, nowMs: 2 },
				{
					metrics: {
						face: { blinking: [{ detected: true, timestamp: 5_000_000 }] },
					},
					nowMs: 3,
				},
				{ metrics: { face: { blinking: [{ detected: true }] } }, nowMs: 4 },
				{ metrics: { face: { blinking: [{}] } }, nowMs: 5 },
			],
		);
		expect(samples).toEqual([
			{ signal: "blink", value: { detected: false }, at: 1 },
			{ signal: "blink", value: { detected: true }, at: 5000 },
			{ signal: "blink", value: { detected: false }, at: 5 },
		]);
	});
});

describe("pose", () => {
	function posePackets(count: number, stepMs: number, yaw = 0) {
		return Array.from({ length: count }, (_, index) => ({
			metrics: {
				face: { landmarks: [{ value: syntheticLandmarks({ yaw, pitch: 0 }) }] },
			} as MetricsLike,
			nowMs: 1000 + index * stepMs,
		}));
	}

	test("waits for the rest pose, then reports relative to it", () => {
		const rest = posePackets(REST_POSE_SAMPLES, 70, 0.1);
		const turned = posePackets(1, 70, 0.4).map((packet) => ({
			...packet,
			nowMs: 1000 + REST_POSE_SAMPLES * 70,
		}));
		const samples = run(["pose"], [...rest, ...turned]);

		expect(samples.at(-1)?.signal).toBe("pose");
		const value = samples.at(-1)?.value as { yaw: number; pitch: number };
		expect(value.yaw).toBeCloseTo(0.3, 2);
		expect(value.pitch).toBeCloseTo(0, 2);
	});

	test("is throttled to 15 per second", () => {
		const packets = posePackets(REST_POSE_SAMPLES + 90, 10);
		const samples = run(["pose"], packets);
		const spanMs = 90 * 10;
		expect(samples.length).toBeLessThanOrEqual(
			Math.ceil(spanMs / POSE_INTERVAL_MS) + 1,
		);
		expect(samples.length).toBeGreaterThan(5);
	});
});

describe("expression", () => {
	test("is sent with server time, at most every 100 ms", () => {
		const metrics: MetricsLike = {
			face: { expression: [{ scores: [{ type: 5, confidence: 70 }] }] },
		};
		const samples = run(
			["expression"],
			[
				{ metrics, nowMs: 1000 },
				{ metrics, nowMs: 1030 },
				{ metrics, nowMs: 1110 },
			],
		);
		expect(samples.map((sample) => sample.at)).toEqual([1000, 1110]);
		expect(samples[0]?.value).toEqual({ HAPPY: 70 });
	});
});

describe("pulse and breathing", () => {
	test("pulse takes the newest rate, converts microseconds, and skips repeats", () => {
		const metrics: MetricsLike = {
			cardio: {
				pulseRate: [
					{ value: 60, confidence: 10, timestamp: 1_000_000 },
					{ value: 72.5, confidence: 83, stable: true, timestamp: 2_500_000 },
				],
			},
		};
		const samples = run(
			["pulse"],
			[
				{ metrics, nowMs: 1 },
				{ metrics, nowMs: 2 },
			],
		);
		expect(samples).toEqual([
			{
				signal: "pulse",
				value: { bpm: 72.5, confidence: 83, stable: true },
				at: 2500,
			},
		]);
	});

	test("breathing maps value to rate; a missing `stable` is false; Long timestamps work", () => {
		const samples = run(
			["breathing"],
			at({
				breathing: {
					rate: [
						{
							value: 14,
							confidence: 30,
							timestamp: { toNumber: () => 3_000_000 },
						},
					],
				},
			}),
		);
		expect(samples).toEqual([
			{
				signal: "breathing",
				value: { rate: 14, confidence: 30, stable: false },
				at: 3000,
			},
		]);
	});

	test("timestamps that are missing or zero fall back to server time", () => {
		expect(timestampToMs(undefined)).toBeNull();
		expect(timestampToMs(0)).toBeNull();
		const samples = run(
			["pulse"],
			at({ cardio: { pulseRate: [{ value: 70 }] } }, 4242),
		);
		expect(samples[0]?.at).toBe(4242);
	});
});

describe("filtering by the requested signals", () => {
	const everything: MetricsLike = {
		face: {
			blinking: [{ detected: true }],
			expression: [{ scores: [{ type: 5, confidence: 70 }] }],
			landmarks: [{ value: syntheticLandmarks({ yaw: 0, pitch: 0 }) }],
		},
		cardio: { pulseRate: [{ value: 70, timestamp: 1_000_000 }] },
		breathing: { rate: [{ value: 15, timestamp: 1_000_000 }] },
	};

	test("nothing requested, nothing sent", () => {
		expect(run([], at(everything))).toEqual([]);
	});

	test("only the requested signals are sent", () => {
		const names = run(["pulse", "blink"], at(everything)).map(
			(sample) => sample.signal,
		);
		expect(names.sort()).toEqual(["blink", "pulse"]);
	});
});
