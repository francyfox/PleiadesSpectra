import { expect, test } from "bun:test";
import type { ExpressionScores } from "@repo/protocol";
import {
	createExpressionGestureState,
	detectExpressionGestures,
	type ExpressionGestureState,
} from "./expression-gestures";
import type { GestureEvent } from "./types";

function feed(scoresList: ExpressionScores[]) {
	let state: ExpressionGestureState = createExpressionGestureState();
	const events: GestureEvent[] = [];
	scoresList.forEach((scores, index) => {
		const step = detectExpressionGestures(state, scores, index * 33);
		state = step.state;
		events.push(...step.events);
	});
	return events;
}

const repeat = (scores: ExpressionScores, count: number) =>
	Array.from({ length: count }, () => scores);

test("a held smile fires once", () => {
	const events = feed(repeat({ HAPPY: 90 }, 30));
	expect(events.map((event) => event.gesture)).toEqual(["smile"]);
	expect(events[0]?.confidence).toBeGreaterThan(0.5);
});

test("one noisy packet does not fire", () => {
	const events = feed([
		...repeat({ NEUTRAL: 90 }, 10),
		{ HAPPY: 95 },
		...repeat({ NEUTRAL: 90 }, 10),
	]);
	expect(events).toEqual([]);
});

test("held puzzled expressions fire confused", () => {
	const events = feed(repeat({ CONTEMPT: 85 }, 30));
	expect(events.map((event) => event.gesture)).toEqual(["confused"]);
});

test("a neutral face fires nothing", () => {
	expect(feed(repeat({ NEUTRAL: 95, SAD: 20 }, 60))).toEqual([]);
});
