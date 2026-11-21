import { expect, test } from "bun:test";
import { framesPerSecond } from "./fps-meter";

test("frames in a window are scaled to one second", () => {
	expect(framesPerSecond(30, 1000)).toBe(30);
	expect(framesPerSecond(29, 1040)).toBe(28);
	expect(framesPerSecond(15, 500)).toBe(30);
});

test("an empty window gives zero", () => {
	expect(framesPerSecond(10, 0)).toBe(0);
});
