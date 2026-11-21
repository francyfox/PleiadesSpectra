import { describe, expect, test } from "bun:test";
import type { InstalledPlugin } from "../plugins/types";
import { resolvePluginDisplayName } from "./display-name";

const plugins: InstalledPlugin[] = [
	{
		id: "rating-1",
		source: "",
		enabled: true,
		header: {
			name: "Service rating",
			author: null,
			matches: ["*://*/*"],
			camera: "on-demand",
			gestures: ["smile"],
		},
	},
];

describe("resolvePluginDisplayName", () => {
	test("uses the sender world id first", () => {
		expect(
			resolvePluginDisplayName(plugins, { userScriptWorldId: "rating-1" }, "x"),
		).toBe("Service rating");
	});

	test("keeps the sent name when nothing matches", () => {
		expect(resolvePluginDisplayName(plugins, {}, "unknown")).toBe("unknown");
	});
});
