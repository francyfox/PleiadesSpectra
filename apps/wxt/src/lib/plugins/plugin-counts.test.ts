import { describe, expect, test } from "bun:test";
import { countPlugins } from "./plugin-counts";
import type { InstalledPlugin } from "./types";

function plugin(enabled: boolean): InstalledPlugin {
	return {
		id: String(Math.random()),
		source: "",
		enabled,
		header: {
			name: "x",
			author: null,
			matches: [],
			camera: "on-demand",
			gestures: [],
			signals: [],
		},
	};
}

describe("countPlugins", () => {
	test("counts the scripts that are on and the ones that are off", () => {
		expect(countPlugins([plugin(true), plugin(false), plugin(true)])).toEqual({
			active: 2,
			disabled: 1,
		});
	});

	test("no scripts is zero and zero", () => {
		expect(countPlugins([])).toEqual({ active: 0, disabled: 0 });
	});
});
