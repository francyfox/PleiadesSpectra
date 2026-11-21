import { expect, test } from "bun:test";
import {
	createHeadGestureState,
	detectHeadGestures,
	type HeadGestureState,
} from "./head-gestures";
import { FRAME_MS } from "./test-helpers";
import type { GestureEvent, HeadPose } from "./types";

function run(poseAt: (timeMs: number) => HeadPose, durationMs: number) {
	let state: HeadGestureState = createHeadGestureState();
	const events: GestureEvent[] = [];
	for (let timeMs = 0; timeMs <= durationMs; timeMs += FRAME_MS) {
		const step = detectHeadGestures(state, poseAt(timeMs), timeMs);
		state = step.state;
		events.push(...step.events);
	}
	return events;
}

const wave = (amplitude: number, periodMs: number) => (timeMs: number) =>
	amplitude * Math.sin((2 * Math.PI * timeMs) / periodMs);

test("a pitch oscillation is a nod", () => {
	const events = run(
		(t) => ({ yaw: 0, roll: 0, pitch: wave(0.08, 500)(t) }),
		1000,
	);
	expect(events.map((event) => event.gesture)).toEqual(["nod"]);
	expect(events[0]?.confidence).toBeGreaterThan(0.5);
});

test("a yaw oscillation is a shake", () => {
	const events = run(
		(t) => ({ yaw: wave(0.15, 500)(t), pitch: 0, roll: 0 }),
		1000,
	);
	expect(events.map((event) => event.gesture)).toEqual(["shake"]);
});

test("a held pitch offset is a tilt, not a nod", () => {
	const events = run(() => ({ yaw: 0, roll: 0, pitch: 0.2 }), 700);
	expect(events.map((event) => event.gesture)).toEqual(["tilt-down"]);
});

test("a held negative pitch tilts up and repeats while held", () => {
	const events = run(() => ({ yaw: 0, roll: 0, pitch: -0.2 }), 1800);
	expect(events.length).toBeGreaterThanOrEqual(2);
	expect(new Set(events.map((event) => event.gesture))).toEqual(
		new Set(["tilt-up"]),
	);
});

test("small jitter fires nothing", () => {
	const events = run(
		(t) => ({ yaw: 0.01 * Math.sin(t), pitch: 0.01 * Math.cos(t), roll: 0 }),
		3000,
	);
	expect(events).toEqual([]);
});

test("one nod fires once inside the cooldown", () => {
	const events = run(
		(t) => ({ yaw: 0, roll: 0, pitch: t < 700 ? wave(0.08, 500)(t) : 0 }),
		1500,
	);
	expect(events.filter((event) => event.gesture === "nod")).toHaveLength(1);
});

const leaned = (roll: number) => ({ yaw: 0, pitch: 0, roll });

test("a lean to the left shoulder held for a moment is one roll-left", () => {
	const events = run(() => leaned(0.35), 2000);
	expect(events.map((event) => event.gesture)).toEqual(["roll-left"]);
});

test("a lean to the right shoulder is a roll-right", () => {
	const events = run(() => leaned(-0.35), 2000);
	expect(events.map((event) => event.gesture)).toEqual(["roll-right"]);
});

test("a lean fires again only after the head has been upright", () => {
	const events = run((t) => leaned(t < 1000 || t >= 2000 ? 0.35 : 0), 3500);
	expect(events.map((event) => event.gesture)).toEqual([
		"roll-left",
		"roll-left",
	]);
});

test("a small lean, or one that is over before the hold time, fires nothing", () => {
	expect(run(() => leaned(0.15), 2000)).toEqual([]);
	expect(run((t) => leaned(t < 150 ? 0.35 : 0), 2000)).toEqual([]);
});
