import type { PluginMessage } from "@repo/protocol";
import { type PluginPermissions, readPagePermissions } from "./permissions";

/** Sends a message to the extension background and resolves with its answer. */
export type Transport = (message: PluginMessage) => Promise<unknown>;

/** Reports, per element, whether any part of it is inside the viewport. */
export interface IntersectionWatcher {
	observe(element: Element): void;
	unobserve(element: Element): void;
	disconnect(): void;
}

export type IntersectionWatcherFactory = (
	onChange: (element: Element, isIntersecting: boolean) => void,
) => IntersectionWatcher;

/** The parts of the page the runtime touches; replaced by fakes in tests. */
export interface RuntimeEnvironment {
	window: EventTarget & {
		MutationObserver: typeof MutationObserver;
		getComputedStyle: typeof getComputedStyle;
	};
	document: Document;
	/** The address of the page; a single-page app changes it without unloading anything. */
	location?: { href: string };
	transport: Transport;
	now: () => number;
	/** Missing where the page cannot observe intersections: `onVisible` then only checks rendering. */
	createIntersectionWatcher?: IntersectionWatcherFactory;
	/** What the script declared; missing means no filter. */
	permissions?: PluginPermissions;
}

interface RuntimeApi {
	sendMessage(message: unknown): Promise<unknown>;
}

interface ExtensionGlobals {
	browser?: { runtime?: RuntimeApi };
	chrome?: { runtime?: RuntimeApi };
}

function findRuntimeApi(globals: ExtensionGlobals): RuntimeApi | undefined {
	return globals.browser?.runtime ?? globals.chrome?.runtime;
}

/** Works in the USER_SCRIPT world: `browser` on Firefox, `chrome` on Chrome. */
export function createGlobalTransport(globals: ExtensionGlobals): Transport {
	return async (message) => {
		const runtime = findRuntimeApi(globals);
		if (!runtime) throw new Error("Extension messaging is not available here");
		return runtime.sendMessage(message);
	};
}

function createPageIntersectionWatcher():
	| IntersectionWatcherFactory
	| undefined {
	if (typeof globalThis.IntersectionObserver !== "function") return undefined;
	return (onChange) =>
		new IntersectionObserver((entries) => {
			for (const entry of entries) onChange(entry.target, entry.isIntersecting);
		});
}

/** Resolved lazily, so importing the module on a page without a DOM is harmless. */
export function createPageEnvironment(): RuntimeEnvironment {
	return {
		createIntersectionWatcher: createPageIntersectionWatcher(),
		window: globalThis as unknown as RuntimeEnvironment["window"],
		document: globalThis.document,
		location: globalThis.location,
		transport: createGlobalTransport(globalThis as ExtensionGlobals),
		now: Date.now,
		permissions: readPagePermissions(globalThis),
	};
}
