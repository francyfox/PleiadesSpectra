import { describe, expect, test } from "bun:test";
import {
	parseWidgetPosition,
	parseWidgetSize,
	widgetPlaces,
} from "@repo/protocol";
import {
	betaClassOf,
	betaStyleOf,
	defaultLook,
	edgeOf,
	isFlipped,
	sideOf,
	widgetClassOf,
} from "./widget-layout";
import { applyMessage, createInitialState } from "./widget-state";

describe("where Beta stands", () => {
	test("by default she is at the bottom right, medium and not turned around", () => {
		expect(betaClassOf(defaultLook)).toBe(
			"beta beta--bottom-right beta--medium",
		);
		expect(betaStyleOf(defaultLook)).toBe("");
		expect(isFlipped(defaultLook.position)).toBe(false);
	});

	test("every named place gets its own class", () => {
		const classes = widgetPlaces.map((place) =>
			betaClassOf({ position: place, size: "medium" }),
		);
		expect(new Set(classes).size).toBe(widgetPlaces.length);
	});

	test("on the left side she is turned around, on the right and in the middle she is not", () => {
		expect(widgetPlaces.filter((place) => isFlipped(place))).toEqual([
			"top-left",
			"left",
			"bottom-left",
		]);
		expect(betaClassOf({ position: "left", size: "small" })).toContain(
			"beta--flipped",
		);
	});

	test("an exact offset sets the sides that are given and keeps a margin on the others", () => {
		const look = { position: { top: 20, left: 40 }, size: "medium" } as const;
		expect(betaClassOf(look)).toContain("beta--exact");
		expect(betaStyleOf(look)).toBe(
			"top: 20px; right: auto; bottom: auto; left: 40px",
		);
		expect(sideOf(look.position)).toBe("left");
		expect(edgeOf(look.position)).toBe("top");
	});

	test("an offset with only one side is placed against the default corner on the other axis", () => {
		const look = { position: { left: 30 }, size: "medium" } as const;
		expect(betaStyleOf(look)).toBe(
			"top: auto; right: auto; bottom: 16px; left: 30px",
		);
	});

	test("a number is the width of Beta in pixels", () => {
		const look = { position: "top", size: 222 } as const;
		expect(betaClassOf(look)).toContain("beta--custom");
		expect(betaStyleOf(look)).toBe("--beta-width: 222px");
	});

	test("the hint card keeps to the side and the edge away from Beta", () => {
		expect(widgetClassOf({ position: "top-left", size: "medium" })).toBe(
			"widget widget--left widget--top",
		);
		expect(widgetClassOf(defaultLook)).toBe(
			"widget widget--right widget--bottom",
		);
	});
});

describe("what a script may send", () => {
	test("unknown places and sizes mean the defaults", () => {
		expect(parseWidgetPosition("middle")).toBeUndefined();
		expect(parseWidgetPosition({})).toBeUndefined();
		expect(parseWidgetPosition({ top: "10" })).toBeUndefined();
		expect(parseWidgetSize("huge")).toBeUndefined();
		expect(parseWidgetSize(Number.NaN)).toBeUndefined();
	});

	test("offsets keep only numbers and sizes stay in range", () => {
		expect(parseWidgetPosition({ top: 10.6, left: "x", extra: 1 })).toEqual({
			top: 11,
		});
		expect(parseWidgetSize(5)).toBe(60);
		expect(parseWidgetSize(9000)).toBe(600);
		expect(parseWidgetSize("large")).toBe("large");
	});
});

describe("a question brings its own place", () => {
	const ask = {
		type: "widget/ask",
		pluginName: "Rating",
		question: "How was it?",
		options: [],
	} as const;

	test("the place and the size of the question are kept until the widget hides", () => {
		const asked = applyMessage(
			createInitialState(),
			{ ...ask, position: "top-left", size: "large" },
			0,
		);
		expect(asked.look).toEqual({ position: "top-left", size: "large" });

		const hidden = applyMessage(asked, { type: "widget/hide" }, 1);
		expect(hidden.look).toEqual(defaultLook);
	});

	test("a question without a place uses the default", () => {
		expect(applyMessage(createInitialState(), ask, 0).look).toEqual(
			defaultLook,
		);
	});
});
