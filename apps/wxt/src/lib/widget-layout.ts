import type {
	WidgetOffset,
	WidgetPlace,
	WidgetPosition,
	WidgetSize,
	WidgetSizeName,
} from "@repo/protocol";

export const DEFAULT_PLACE: WidgetPlace = "bottom-right";
export const DEFAULT_SIZE: WidgetSizeName = "medium";

/** Margin from the edges of the window when a side is not given exactly. */
const EDGE_MARGIN_PX = 16;

export type Side = "left" | "right";
export type Edge = "top" | "bottom";

export interface WidgetLook {
	position: WidgetPosition;
	size: WidgetSize;
}

export const defaultLook: WidgetLook = {
	position: DEFAULT_PLACE,
	size: DEFAULT_SIZE,
};

function isOffset(position: WidgetPosition): position is WidgetOffset {
	return typeof position === "object";
}

/** Beta looks toward the middle of the page: from the right side she is drawn as is, from the left side she is turned around. */
export function sideOf(position: WidgetPosition): Side {
	if (isOffset(position))
		return position.left !== undefined && position.right === undefined
			? "left"
			: "right";
	return position.endsWith("left") ? "left" : "right";
}

/** The hint card and the toast keep to the other edge, so they stay clear of Beta. */
export function edgeOf(position: WidgetPosition): Edge {
	if (isOffset(position))
		return position.top !== undefined && position.bottom === undefined
			? "top"
			: "bottom";
	return position.startsWith("top") ? "top" : "bottom";
}

export function isFlipped(position: WidgetPosition): boolean {
	return sideOf(position) === "left";
}

export function widgetClassOf(look: WidgetLook): string {
	return `widget widget--${sideOf(look.position)} widget--${edgeOf(look.position)}`;
}

function placeClassOf(position: WidgetPosition): string {
	return isOffset(position) ? "beta--exact" : `beta--${position}`;
}

function sizeClassOf(size: WidgetSize): string {
	return typeof size === "number" ? "beta--custom" : `beta--${size}`;
}

export function betaClassOf(look: WidgetLook): string {
	const flipped = isFlipped(look.position) ? " beta--flipped" : "";
	return `beta ${placeClassOf(look.position)} ${sizeClassOf(look.size)}${flipped}`;
}

function pixels(distance: number | undefined): string {
	return distance === undefined ? "auto" : `${distance}px`;
}

function exactOffsetStyle(offset: WidgetOffset): string {
	const hasHorizontal = offset.left !== undefined || offset.right !== undefined;
	const hasVertical = offset.top !== undefined || offset.bottom !== undefined;
	const right = hasHorizontal ? offset.right : EDGE_MARGIN_PX;
	const bottom = hasVertical ? offset.bottom : EDGE_MARGIN_PX;
	return `top: ${pixels(offset.top)}; right: ${pixels(right)}; bottom: ${pixels(bottom)}; left: ${pixels(offset.left)}`;
}

/** Only exact values need an inline style: the named places and sizes are classes. */
export function betaStyleOf(look: WidgetLook): string {
	const styles: string[] = [];
	if (isOffset(look.position)) styles.push(exactOffsetStyle(look.position));
	if (typeof look.size === "number")
		styles.push(`--beta-width: ${look.size}px`);
	return styles.join("; ");
}
