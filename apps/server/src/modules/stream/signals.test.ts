import { expect, test } from "bun:test";
import { presage } from "@smartspectra/node-sdk/messages";
import { signalsFromMetrics } from "./signals";

const { ExpressionType } = presage.smartspectra;

test("maps expression types to names and keeps the percentages", () => {
	const signals = signalsFromMetrics({
		face: {
			expression: [
				{
					scores: [
						{ type: ExpressionType.HAPPY, confidence: 80 },
						{ type: ExpressionType.SAD, confidence: 5 },
						{ type: ExpressionType.UNSPECIFIED, confidence: 99 },
					],
				},
			],
		},
	});
	expect(signals.expression).toEqual({ HAPPY: 80, SAD: 5 });
});

test("a talking entry without `detected` means not talking", () => {
	expect(signalsFromMetrics({ face: { talking: [{}] } }).isTalking).toBe(false);
	expect(
		signalsFromMetrics({ face: { talking: [{ detected: true }] } }).isTalking,
	).toBe(true);
});

test("takes the newest landmarks and passes the reset flag", () => {
	const signals = signalsFromMetrics({
		face: {
			landmarks: [
				{ value: [{ x: 1, y: 1 }] },
				{ value: [{ x: 5, y: 6 }], reset: true },
			],
		},
	});
	expect(signals.landmarks).toEqual([{ x: 5, y: 6 }]);
	expect(signals.landmarksReset).toBe(true);
});
