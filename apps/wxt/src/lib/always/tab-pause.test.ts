import { describe, expect, test } from "bun:test";
import { createTabPause } from "./tab-pause.service";

function setup(initial: number[] = []) {
	let stored = initial;
	const pause = createTabPause({
		load: async () => stored,
		save: async (tabIds) => {
			stored = tabIds;
		},
	});
	return { pause, stored: () => stored };
}

describe("the pause of a tab", () => {
	test("a paused tab is paused until the pause is taken off", async () => {
		const { pause } = setup();
		await pause.pause(3);
		expect(await pause.isPaused(3)).toBe(true);
		expect(await pause.isPaused(4)).toBe(false);

		expect(await pause.resume(3)).toBe(true);
		expect(await pause.isPaused(3)).toBe(false);
	});

	test("taking off a pause that was not there says so", async () => {
		const { pause } = setup();
		expect(await pause.resume(9)).toBe(false);
	});

	test("pauses are kept through the storage and survive a restart of the background", async () => {
		const first = setup();
		await first.pause.pause(5);
		const second = setup(first.stored());
		expect(await second.pause.isPaused(5)).toBe(true);
	});
});
