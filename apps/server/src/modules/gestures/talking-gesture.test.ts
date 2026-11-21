import { expect, test } from "bun:test";
import {
	createTalkingGestureState,
	detectTalkingGesture,
} from "./talking-gesture";

function feed(isTalkingAt: (timeMs: number) => boolean, durationMs: number) {
	let state = createTalkingGestureState();
	let fired = 0;
	for (let timeMs = 0; timeMs <= durationMs; timeMs += 33) {
		const step = detectTalkingGesture(state, isTalkingAt(timeMs), timeMs);
		state = step.state;
		fired += step.events.length;
	}
	return fired;
}

test("fires after the onset and repeats while talking continues", () => {
	expect(feed(() => true, 2500)).toBe(3);
});

test("a short blip does not fire", () => {
	expect(feed((timeMs) => timeMs < 150, 1000)).toBe(0);
});
