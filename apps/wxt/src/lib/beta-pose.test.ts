import { describe, expect, test } from "bun:test";
import {
	beatSeconds,
	nextShakeIsMirrored,
	POSE_FILE,
	poseForGesture,
} from "./beta-pose";

describe("poses for gestures", () => {
	test("head gestures have a pose, expressions stay on the drawn face", () => {
		expect(poseForGesture("tilt-up")).toBe("top");
		expect(poseForGesture("tilt-down")).toBe("down");
		expect(poseForGesture("nod")).toBe("down");
		expect(poseForGesture("shake")).toBe("rotate");
		expect(poseForGesture("smile")).toBeUndefined();
		expect(poseForGesture("confused")).toBeUndefined();
		expect(poseForGesture("talking")).toBeUndefined();
	});

	test("every pose has a picture in public/beta", () => {
		for (const file of Object.values(POSE_FILE))
			expect(file).toMatch(/^\/beta\/[a-z]+\.webp$/);
	});

	test("shake turns to one side and then to the other", () => {
		expect(nextShakeIsMirrored(false)).toBe(true);
		expect(nextShakeIsMirrored(true)).toBe(false);
	});
});

describe("beat of the heart", () => {
	test("one beat lasts 60 / rate seconds, kept between 30 and 220 beats a minute", () => {
		expect(beatSeconds(60)).toBe(1);
		expect(beatSeconds(120)).toBe(0.5);
		expect(beatSeconds(300)).toBeCloseTo(60 / 220, 5);
		expect(beatSeconds(10)).toBe(2);
	});

	test("a missing or odd rate means 70 beats a minute", () => {
		expect(beatSeconds(undefined)).toBeCloseTo(60 / 70, 5);
		expect(beatSeconds(0)).toBeCloseTo(60 / 70, 5);
	});
});
