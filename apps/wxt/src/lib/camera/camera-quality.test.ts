import { describe, expect, it } from "bun:test";
import {
	chooseHint,
	createQualityMonitor,
	DARK_HINT,
	LOW_FPS_HINT_PREFIX,
	measureBrightness,
	QUALITY_WINDOW_MS,
} from "./camera-quality";

function frame(level: number): Uint8ClampedArray {
	return new Uint8ClampedArray(64 * 4).fill(level);
}

/** Feeds `seconds` of frames at `fps` and returns every hint reported. */
function run(level: number, fps: number, seconds: number): string[] {
	const hints: string[] = [];
	const monitor = createQualityMonitor((hint) => hints.push(hint));
	const gap = 1000 / fps;
	for (let at = 0; at <= seconds * 1000; at += gap)
		monitor.push(frame(level), at);
	return hints;
}

describe("camera quality", () => {
	it("measures brightness", () => {
		expect(measureBrightness(frame(0))).toBe(0);
		expect(Math.round(measureBrightness(frame(200)))).toBe(200);
	});

	it("prefers the dark hint over the slow one", () => {
		expect(chooseHint(10, 15)).toBe(DARK_HINT);
		expect(chooseHint(150, 15)).toContain(LOW_FPS_HINT_PREFIX);
		expect(chooseHint(150, 30)).toBe("");
	});

	it("stays quiet for a bright picture at 30 fps", () => {
		expect(run(150, 30, 8)).toEqual([]);
	});

	it("reports a dark picture once, after the warm-up window", () => {
		const hints = run(10, 30, 8);
		expect(hints).toEqual([DARK_HINT]);
	});

	it("reports a slow camera with the measured rate", () => {
		const [hint] = run(150, 15, 8);
		expect(hint).toContain(LOW_FPS_HINT_PREFIX);
		expect(hint).toContain("15 fps");
	});

	it("says nothing while the first window is still running", () => {
		expect(run(10, 30, QUALITY_WINDOW_MS / 1000 - 0.5)).toEqual([]);
	});
});
