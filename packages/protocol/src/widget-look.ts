export const widgetPlaces = [
	"top-left",
	"top",
	"top-right",
	"left",
	"center",
	"right",
	"bottom-left",
	"bottom",
	"bottom-right",
] as const;

/** A named spot on the screen; the widget sits there with a small margin. */
export type WidgetPlace = (typeof widgetPlaces)[number];

/** Distances from the edges of the window in pixels; a side that is left out is not tied to its edge. */
export interface WidgetOffset {
	top?: number;
	right?: number;
	bottom?: number;
	left?: number;
}

export type WidgetPosition = WidgetPlace | WidgetOffset;

export const widgetSizes = ["small", "medium", "large"] as const;

export type WidgetSizeName = (typeof widgetSizes)[number];

/** A named size, or the width of Beta in pixels. */
export type WidgetSize = WidgetSizeName | number;

export const MIN_WIDGET_WIDTH = 60;
export const MAX_WIDGET_WIDTH = 600;

const OFFSET_SIDES = ["top", "right", "bottom", "left"] as const;

export function isWidgetPlace(value: unknown): value is WidgetPlace {
	return (widgetPlaces as readonly unknown[]).includes(value);
}

export function isWidgetSizeName(value: unknown): value is WidgetSizeName {
	return (widgetSizes as readonly unknown[]).includes(value);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function parseOffset(value: unknown): WidgetOffset | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const offset: WidgetOffset = {};
	for (const side of OFFSET_SIDES) {
		const distance = (value as Record<string, unknown>)[side];
		if (isFiniteNumber(distance)) offset[side] = Math.round(distance);
	}
	return Object.keys(offset).length > 0 ? offset : undefined;
}

/** Scripts run in the page, so what they send is checked: anything unknown means the default place. */
export function parseWidgetPosition(
	value: unknown,
): WidgetPosition | undefined {
	return isWidgetPlace(value) ? value : parseOffset(value);
}

export function parseWidgetSize(value: unknown): WidgetSize | undefined {
	if (isWidgetSizeName(value)) return value;
	if (!isFiniteNumber(value)) return undefined;
	return Math.min(
		MAX_WIDGET_WIDTH,
		Math.max(MIN_WIDGET_WIDTH, Math.round(value)),
	);
}
