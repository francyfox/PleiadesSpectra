import { describe, expect, test } from "bun:test";
import { parseHeader } from "../src/header";

const VALID_SOURCE = `// @ts-check
// ==Reaction==
// @name        Service rating
// @author      Pleiades
// @match       *://shop.example.com/*
// @match       https://*.example.org/path/*
// @camera      on-demand
// @gestures    smile, confused nod
// @signals     blink, pose pulse blink
// ==/Reaction==

reaction("rating");
`;

function withHeader(...lines: string[]): string {
	return ["// ==Reaction==", ...lines, "// ==/Reaction=="].join("\n");
}

describe("parseHeader", () => {
	test("parses a valid header", () => {
		expect(parseHeader(VALID_SOURCE)).toEqual({
			ok: true,
			header: {
				name: "Service rating",
				author: "Pleiades",
				matches: ["*://shop.example.com/*", "https://*.example.org/path/*"],
				camera: "on-demand",
				gestures: ["smile", "confused", "nod"],
				signals: ["blink", "pose", "pulse"],
			},
		});
	});

	test("defaults the camera mode and the gestures", () => {
		const result = parseHeader(
			withHeader("// @name A", "// @match <all_urls>"),
		);
		expect(result).toEqual({
			ok: true,
			header: {
				name: "A",
				author: null,
				matches: ["<all_urls>"],
				camera: "on-demand",
				gestures: [],
				signals: [],
			},
		});
	});

	test("rejects a header without a name", () => {
		const result = parseHeader(withHeader("// @match *://*/*"));
		expect(result).toEqual({
			ok: false,
			error: "Add a `@name` to the header.",
		});
	});

	test("rejects a header without a match pattern", () => {
		const result = parseHeader(withHeader("// @name A"));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("@match");
	});

	test("rejects an unknown gesture", () => {
		const result = parseHeader(
			withHeader("// @name A", "// @match *://*/*", "// @gestures smile, wink"),
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('"wink"');
	});

	test("rejects an unknown signal", () => {
		const result = parseHeader(
			withHeader("// @name A", "// @match *://*/*", "// @signals blink, gaze"),
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain('"gaze"');
			expect(result.error).toContain("pulse");
		}
	});

	test("rejects code inside the block", () => {
		const result = parseHeader(
			withHeader("// @name A", "doSomething()", "// @match *://*/*"),
		);
		expect(result.ok).toBe(false);
	});

	test("rejects a missing or unclosed header", () => {
		expect(parseHeader("reaction('x')").ok).toBe(false);
		expect(parseHeader("// ==Reaction==\n// @name A").ok).toBe(false);
	});

	test("handles CRLF line endings", () => {
		expect(parseHeader(VALID_SOURCE.replaceAll("\n", "\r\n")).ok).toBe(true);
	});
});
