import { describe, expect, test } from "bun:test";
import {
	findOverlaps,
	globsIntersect,
	patternsOverlap,
} from "./plugin-overlap";
import type { InstalledPlugin } from "./types";

function plugin(
	id: string,
	matches: string[],
	extra: Partial<InstalledPlugin["header"]> = {},
	enabled = true,
): InstalledPlugin {
	return {
		id,
		source: "",
		enabled,
		header: {
			name: id.toUpperCase(),
			author: null,
			matches,
			camera: "on-demand",
			gestures: [],
			signals: [],
			...extra,
		},
	};
}

describe("globsIntersect", () => {
	test("literals and stars", () => {
		expect(globsIntersect("/a", "/a")).toBe(true);
		expect(globsIntersect("/a", "/b")).toBe(false);
		expect(globsIntersect("/*", "/x/y")).toBe(true);
		expect(globsIntersect("/p*", "/*q")).toBe(true);
		expect(globsIntersect("/p*", "/q*")).toBe(false);
		expect(globsIntersect("/a*b", "/a*c")).toBe(false);
		expect(globsIntersect("/*a*", "/b*c")).toBe(true);
		expect(globsIntersect("", "*")).toBe(true);
	});
});

describe("patternsOverlap", () => {
	test("different hosts do not overlap", () => {
		expect(patternsOverlap("*://a.com/*", "*://b.com/*")).toBe(false);
	});
	test("a subdomain wildcard overlaps a path on a subdomain", () => {
		expect(patternsOverlap("*://*.a.com/*", "*://x.a.com/p*")).toBe(true);
	});
	test("a subdomain wildcard covers the bare domain", () => {
		expect(patternsOverlap("*://*.a.com/*", "https://a.com/")).toBe(true);
	});
	test("a bare domain is not a subdomain of another", () => {
		expect(patternsOverlap("*://*.a.com/*", "*://b.com/*")).toBe(false);
		expect(patternsOverlap("*://*.a.com/*", "*://xa.com/*")).toBe(false);
	});
	test("<all_urls> overlaps any web pattern", () => {
		expect(patternsOverlap("<all_urls>", "*://a.com/x")).toBe(true);
		expect(patternsOverlap("<all_urls>", "file:///tmp/*")).toBe(true);
	});
	test("schemes", () => {
		expect(patternsOverlap("http://a.com/*", "https://a.com/*")).toBe(false);
		expect(patternsOverlap("*://a.com/*", "https://a.com/*")).toBe(true);
		expect(patternsOverlap("*://a.com/*", "ftp://a.com/*")).toBe(false);
	});
	test("paths", () => {
		expect(patternsOverlap("*://a.com/shop/*", "*://a.com/blog/*")).toBe(false);
		expect(patternsOverlap("*://a.com/shop/*", "*://a.com/*/cart")).toBe(true);
		expect(patternsOverlap("*://a.com/", "*://a.com/*")).toBe(true);
		expect(patternsOverlap("*://a.com/x", "*://a.com/y")).toBe(false);
	});
	test("host is case-insensitive", () => {
		expect(patternsOverlap("*://A.com/*", "*://a.COM/*")).toBe(true);
	});
	test("an unreadable pattern counts as overlapping", () => {
		expect(patternsOverlap("nonsense", "*://a.com/*")).toBe(true);
	});
	test("localhost with a wildcard host", () => {
		expect(patternsOverlap("*://localhost/sleep*", "*://localhost/*")).toBe(
			true,
		);
		expect(
			patternsOverlap("*://localhost/sleep*", "*://localhost/breathe*"),
		).toBe(false);
	});
});

describe("findOverlaps", () => {
	test("names the neighbour and the shared gestures", () => {
		const a = plugin("a", ["*://x.com/*"], { gestures: ["nod", "smile"] });
		const b = plugin("b", ["*://*.x.com/*"], { gestures: ["nod"] });
		const result = findOverlaps([a, b]);
		expect(result.get("a")?.sharesWith).toEqual(["B"]);
		expect(result.get("a")?.warnings).toEqual([
			"Both listen for: nod. Both will react.",
		]);
		expect(result.get("b")?.sharesWith).toEqual(["A"]);
	});
	test("always-on cameras and shared signals are reasons", () => {
		const a = plugin("a", ["<all_urls>"], {
			camera: "always",
			signals: ["pulse"],
		});
		const b = plugin("b", ["*://x.com/*"], {
			camera: "always",
			signals: ["pulse", "blink"],
		});
		expect(findOverlaps([a, b]).get("a")?.warnings).toEqual([
			"Both keep the camera always on.",
			"Both read the same signals: pulse.",
		]);
	});
	test("shared pages alone give no warning", () => {
		const result = findOverlaps([
			plugin("a", ["*://x.com/*"]),
			plugin("b", ["*://x.com/*"]),
		]);
		expect(result.get("a")?.warnings).toEqual([]);
	});
	test("a script on another site is not listed", () => {
		const result = findOverlaps([
			plugin("a", ["*://x.com/*"]),
			plugin("b", ["*://x.com/*"]),
			plugin("c", ["*://y.com/*"]),
		]);
		expect(result.has("c")).toBe(false);
	});
	test("disabled scripts are ignored", () => {
		const result = findOverlaps([
			plugin("a", ["*://x.com/*"]),
			plugin("b", ["*://x.com/*"], {}, false),
		]);
		expect(result.size).toBe(0);
	});
	test("with several neighbours warnings name them", () => {
		const a = plugin("a", ["*://x.com/*"], { gestures: ["nod"] });
		const b = plugin("b", ["*://x.com/*"], { gestures: ["nod"] });
		const c = plugin("c", ["*://x.com/*"], { gestures: ["nod"] });
		expect(findOverlaps([a, b, c]).get("a")?.warnings).toEqual([
			"B: Both listen for: nod. Both will react.",
			"C: Both listen for: nod. Both will react.",
		]);
	});
});
