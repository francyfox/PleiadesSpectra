import type { RuntimeEnvironment } from "./environment";
import { isElementVisible } from "./triggers";

const POLL_MS = 250;
const NAVIGATION_EVENTS = ["popstate", "hashchange"] as const;

export interface ContextWatch {
	/** Resolves once, when the page the question was asked on is no longer the same. */
	changed: Promise<void>;
	stop(): void;
}

/**
 * A question belongs to a place: the address it was asked at and, when a trigger element started it,
 * that element. A single-page app can move away without unloading the page, so both are watched
 * while the question is open: a route change, or the element being removed or hidden, makes it stale.
 */
export function watchContext(
	environment: RuntimeEnvironment,
	element: Element | null,
): ContextWatch {
	const startedAt = environment.location?.href;
	let stop = () => {};

	const changed = new Promise<void>((resolve) => {
		const isStale = () =>
			(startedAt !== undefined && environment.location?.href !== startedAt) ||
			(element !== null && !isElementVisible(element, environment));
		const check = () => {
			if (isStale()) resolve();
		};

		const timer = setInterval(check, POLL_MS);
		for (const type of NAVIGATION_EVENTS)
			environment.window.addEventListener(type, check);
		stop = () => {
			clearInterval(timer);
			for (const type of NAVIGATION_EVENTS)
				environment.window.removeEventListener(type, check);
		};
	});
	return { changed, stop };
}
