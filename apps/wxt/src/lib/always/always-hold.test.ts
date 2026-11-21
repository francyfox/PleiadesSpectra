import { describe, expect, test } from "bun:test";
import type { InstalledPlugin } from "../plugins/types";
import { holdingPluginNames, shouldHoldCamera } from "./always-hold";

function plugin(
	name: string,
	matches: string[],
	options: { camera?: "always" | "ask"; enabled?: boolean } = {},
): InstalledPlugin {
	return {
		id: name,
		source: "",
		enabled: options.enabled ?? true,
		header: {
			name,
			author: null,
			matches,
			camera: options.camera ?? "always",
			gestures: [],
			signals: [],
		},
	};
}

const scroll = plugin("scroll", ["*://localhost/*"]);
const blog = { id: 7, url: "http://localhost:4010/" };
const none = new Set<number>();

describe("when the camera is held for always scripts", () => {
	test("it is held for the tab in front that a script works on", () => {
		expect(shouldHoldCamera([scroll], blog, none)).toBe(true);
	});

	test("a page that no script matches holds nothing", () => {
		const other = { id: 7, url: "https://example.com/" };
		expect(shouldHoldCamera([scroll], other, none)).toBe(false);
		expect(
			shouldHoldCamera([scroll], { id: 7, url: "about:blank" }, none),
		).toBe(false);
	});

	test("no tab in front, no camera", () => {
		expect(shouldHoldCamera([scroll], null, none)).toBe(false);
	});

	test("a disabled script and a script that asks only on demand hold nothing", () => {
		const off = plugin("off", ["*://*/*"], { enabled: false });
		const onDemand = plugin("ask", ["*://*/*"], { camera: "ask" });
		expect(shouldHoldCamera([off, onDemand], blog, none)).toBe(false);
	});

	test("a paused tab holds nothing, and the pause is the tab's own", () => {
		expect(shouldHoldCamera([scroll], blog, new Set([7]))).toBe(false);
		expect(shouldHoldCamera([scroll], blog, new Set([8]))).toBe(true);
	});

	test("the names are those of the scripts that match, in the order of the list", () => {
		const second = plugin("second", ["*://*/*"]);
		const elsewhere = plugin("elsewhere", ["https://example.com/*"]);
		expect(holdingPluginNames([second, elsewhere, scroll], blog, none)).toEqual(
			["second", "scroll"],
		);
	});
});
