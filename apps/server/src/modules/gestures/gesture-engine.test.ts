import { expect, test } from "bun:test";
import { createGestureEngineState, stepGestureEngine } from "./gesture-engine";
import { REST_POSE_SAMPLES } from "./rest-pose";
import { FRAME_MS, syntheticLandmarks } from "./test-helpers";
import type { GestureEvent } from "./types";

function runPoses(poses: Array<{ yaw: number; pitch: number }>) {
	let state = createGestureEngineState();
	const events: GestureEvent[] = [];
	poses.forEach((pose, index) => {
		const step = stepGestureEngine(
			state,
			{ landmarks: syntheticLandmarks(pose) },
			index * FRAME_MS,
		);
		state = step.state;
		events.push(...step.events);
	});
	return events;
}

const restFrames = (offset: { yaw: number; pitch: number }) =>
	Array.from({ length: REST_POSE_SAMPLES }, () => offset);

test("calibrates on the session's first poses and ignores the offset of that pose", () => {
	const events = runPoses([
		...restFrames({ yaw: 0.2, pitch: 0.5 }),
		...Array.from({ length: 40 }, () => ({ yaw: 0.2, pitch: 0.5 })),
	]);
	expect(events).toEqual([]);
});

test("detects a nod relative to the calibrated pose", () => {
	const nod = Array.from({ length: 30 }, (_, index) => ({
		yaw: 0.2,
		pitch: 0.5 + 0.08 * Math.sin((2 * Math.PI * index * FRAME_MS) / 500),
	}));
	const events = runPoses([...restFrames({ yaw: 0.2, pitch: 0.5 }), ...nod]);
	expect(events.map((event) => event.gesture)).toEqual(["nod"]);
});

const framesFor = (seconds: number) => Math.round((seconds * 1000) / FRAME_MS);

test("a still head with sensor noise fires nothing", () => {
	const noisy = Array.from({ length: framesFor(10) }, (_, index) => ({
		yaw: 0.2 + 0.012 * Math.sin(index * 1.7) + 0.008 * Math.cos(index * 0.9),
		pitch: 0.5 + 0.012 * Math.cos(index * 2.3) + 0.008 * Math.sin(index * 1.1),
	}));
	expect(runPoses([...restFrames({ yaw: 0.2, pitch: 0.5 }), ...noisy])).toEqual(
		[],
	);
});

test("a slow drift of the head pose is not a gesture", () => {
	const drift = Array.from({ length: framesFor(8) }, (_, index) => {
		const progress = index / framesFor(8);
		return { yaw: 0.2 + 0.1 * progress, pitch: 0.5 + 0.08 * progress };
	});
	expect(runPoses([...restFrames({ yaw: 0.2, pitch: 0.5 }), ...drift])).toEqual(
		[],
	);
});

test("detects a shake relative to the calibrated pose", () => {
	const shake = Array.from({ length: 30 }, (_, index) => ({
		yaw: 0.2 + 0.15 * Math.sin((2 * Math.PI * index * FRAME_MS) / 500),
		pitch: 0.5,
	}));
	const events = runPoses([...restFrames({ yaw: 0.2, pitch: 0.5 }), ...shake]);
	expect(events.map((event) => event.gesture)).toEqual(["shake"]);
});

test("combines expression and talking events from one packet", () => {
	let state = createGestureEngineState();
	const gestures = new Set<string>();
	for (let index = 0; index < 40; index++) {
		const step = stepGestureEngine(
			state,
			{ expression: { HAPPY: 90 }, isTalking: true },
			index * FRAME_MS,
		);
		state = step.state;
		for (const event of step.events) gestures.add(event.gesture);
	}
	expect(gestures).toEqual(new Set(["smile", "talking"]));
});
