import { expect, test } from "bun:test";
import { headPoseOf } from "./head-pose";
import { syntheticLandmarks } from "./test-helpers";

test("head roll does not change the yaw and pitch that gestures are built on", () => {
	const upright = headPoseOf(syntheticLandmarks({ yaw: 0.1, pitch: 0.5 }));
	const rolled = headPoseOf(syntheticLandmarks({ yaw: 0.1, pitch: 0.5 }, 0.4));
	expect(rolled?.yaw).toBeCloseTo(upright?.yaw ?? NaN, 5);
	expect(rolled?.pitch).toBeCloseTo(upright?.pitch ?? NaN, 5);
});

test("roll is the angle of the eye line, and grows when the left eye is lower in the picture", () => {
	const leaned = headPoseOf(syntheticLandmarks({ yaw: 0, pitch: 0.5 }, 0.3));
	const upright = headPoseOf(syntheticLandmarks({ yaw: 0, pitch: 0.5 }));

	expect(leaned?.roll).toBeCloseTo(0.3, 5);
	expect(upright?.roll).toBeCloseTo(0, 5);
});
