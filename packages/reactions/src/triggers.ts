import {
	GESTURE_EVENT_NAME,
	type GestureEventDetail,
	isGesture,
} from "@repo/protocol";
import type { RuntimeEnvironment } from "./environment";
import { isGestureAllowed } from "./permissions";

export type Disposer = () => void;

/** Changes of these attributes can show or hide an element without adding or removing a node. */
const VISIBILITY_ATTRIBUTES = [
	"class",
	"style",
	"hidden",
	"open",
	"aria-hidden",
];

type VisibilityCheck = (options: {
	checkVisibilityCSS: boolean;
	visibilityProperty: boolean;
}) => boolean;

function isRenderedByStyle(
	element: Element,
	environment: RuntimeEnvironment,
): boolean {
	for (let node: Element | null = element; node; node = node.parentElement) {
		if (node.hasAttribute("hidden")) return false;
		if (node.tagName === "DIALOG" && !node.hasAttribute("open")) return false;
		const style = environment.window.getComputedStyle(node);
		if (style.display === "none") return false;
		if (node === element && style.visibility === "hidden") return false;
	}
	return true;
}

/**
 * Visible means rendered: connected, no `display: none` or `hidden` on it or an ancestor, a closed
 * `<dialog>` and `visibility: hidden` excluded. The browser's own `checkVisibility` adds what the
 * walk cannot see (e.g. `content-visibility`); it is skipped where it does not exist.
 */
export function isElementVisible(
	element: Element,
	environment: RuntimeEnvironment,
): boolean {
	if (!element.isConnected) return false;
	if (!isRenderedByStyle(element, environment)) return false;
	const check = (element as { checkVisibility?: VisibilityCheck })
		.checkVisibility;
	if (typeof check !== "function") return true;
	return check.call(element, {
		checkVisibilityCSS: true,
		visibilityProperty: true,
	});
}

export interface WatchVisibilityOptions {
	/** Also require the element to be inside the viewport. */
	scope: boolean;
}

/**
 * Calls `onVisible` when an element that matches `selector` becomes visible, including elements that are
 * visible already. An element that hides and shows again fires again; one that stays visible fires once.
 * With `scope`, visible also means inside the viewport, as an `IntersectionObserver` reports it.
 */
export function watchVisibility(
	selector: string,
	environment: RuntimeEnvironment,
	onVisible: (element: Element) => void,
	options: WatchVisibilityOptions = { scope: true },
): Disposer {
	const fired = new Set<Element>();
	const inViewport = new Set<Element>();
	const watched = new Set<Element>();

	const intersections = options.scope
		? environment.createIntersectionWatcher?.((element, isIntersecting) => {
				if (isIntersecting) inViewport.add(element);
				else inViewport.delete(element);
				evaluate();
			})
		: undefined;

	const isVisibleNow = (element: Element) =>
		isElementVisible(element, environment) &&
		(!intersections || inViewport.has(element));

	const forgetGone = () => {
		for (const element of watched) {
			if (element.isConnected) continue;
			watched.delete(element);
			inViewport.delete(element);
			intersections?.unobserve(element);
		}
		for (const element of fired)
			if (!isVisibleNow(element)) fired.delete(element);
	};

	function evaluate() {
		forgetGone();
		for (const element of environment.document.querySelectorAll(selector)) {
			if (intersections && !watched.has(element)) {
				watched.add(element);
				intersections.observe(element);
			}
			if (fired.has(element) || !isVisibleNow(element)) continue;
			fired.add(element);
			onVisible(element);
		}
	}

	const observer = new environment.window.MutationObserver(evaluate);
	evaluate();
	observer.observe(environment.document, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: VISIBILITY_ATTRIBUTES,
	});
	return () => {
		observer.disconnect();
		intersections?.disconnect();
	};
}

function closestElement(target: EventTarget | null, selector: string) {
	const element = target as Element | null;
	return element?.closest?.(selector) ?? null;
}

/** A selector is delegated from the document in the capture phase, so it also sees elements added later. */
export function watchEvent(
	target: string | EventTarget,
	type: string,
	environment: RuntimeEnvironment,
	onEvent: (domEvent: Event, element: Element | null) => void,
): Disposer {
	if (typeof target !== "string") {
		const listener = (domEvent: Event) => onEvent(domEvent, null);
		target.addEventListener(type, listener);
		return () => target.removeEventListener(type, listener);
	}

	const listener = (domEvent: Event) => {
		const element = closestElement(domEvent.target, target);
		if (element) onEvent(domEvent, element);
	};
	environment.document.addEventListener(type, listener, true);
	return () => environment.document.removeEventListener(type, listener, true);
}

function isGestureDetail(value: unknown): value is GestureEventDetail {
	if (typeof value !== "object" || value === null) return false;
	const { gesture, confidence } = value as Partial<GestureEventDetail>;
	return isGesture(gesture) && typeof confidence === "number";
}

/** The detail may cross the content-script boundary as a JSON string. */
function readGestureDetail(event: Event): GestureEventDetail | null {
	const { detail } = event as CustomEvent<unknown>;
	try {
		const parsed = typeof detail === "string" ? JSON.parse(detail) : detail;
		return isGestureDetail(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

export function watchGestures(
	environment: RuntimeEnvironment,
	onGesture: (detail: GestureEventDetail) => void,
): Disposer {
	const listener = (event: Event) => {
		const detail = readGestureDetail(event);
		if (detail && isGestureAllowed(environment, detail.gesture))
			onGesture(detail);
	};
	environment.window.addEventListener(GESTURE_EVENT_NAME, listener);
	return () =>
		environment.window.removeEventListener(GESTURE_EVENT_NAME, listener);
}
