import type { Gesture, SignalName } from "@repo/protocol";
import type {
	DomEventContext,
	GestureContext,
	Handler,
	SignalContext,
	VisibleContext,
} from "./types";

interface RuleLimits {
	cooldownMs: number;
	minConfidence: number;
}

export interface VisibleRule extends RuleLimits {
	kind: "visible";
	selector: string;
	/** Also require the element to be inside the viewport, not only rendered. */
	scope: boolean;
	handler: Handler<VisibleContext>;
}

export interface EventRule extends RuleLimits {
	kind: "event";
	target: string | EventTarget;
	type: string;
	handler: Handler<DomEventContext>;
}

export interface GestureRule extends RuleLimits {
	kind: "gesture";
	gesture: Gesture;
	handler: Handler<GestureContext>;
}

export interface SignalRule extends RuleLimits {
	kind: "signal";
	signal: SignalName;
	minIntervalMs: number;
	handler: Handler<SignalContext>;
}

export type Rule = VisibleRule | EventRule | GestureRule | SignalRule;
