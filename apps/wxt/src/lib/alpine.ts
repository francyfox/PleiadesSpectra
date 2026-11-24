// CSP build: MV3 extension pages and content scripts forbid `new Function`/eval,
// which the regular alpinejs build uses. Directive expressions must therefore stay
// simple (property access, method calls); logic lives in Alpine.data components.
import Alpine from "@alpinejs/csp";
import resize from "@alpinejs/resize";

Alpine.plugin(resize);

export { Alpine };

/** Render a TSX tree into `root` and start Alpine on it. */
export function mount(root: Element, html: string | Promise<string>): void {
	if (typeof html !== "string")
		throw new Error("Async components are not supported here");
	root.innerHTML = html;
	Alpine.start();
}

/**
 * Render into an isolated tree, e.g. a shadow root inside a host page, and initialise only that subtree.
 * It skips `Alpine.start()` on purpose: start() also initialises every `x-data` of the host page.
 */
export function mountIsolated(
	root: HTMLElement,
	html: string | Promise<string>,
): void {
	if (typeof html !== "string")
		throw new Error("Async components are not supported here");
	root.innerHTML = html;
	Alpine.initTree(root);
}

type Refs = Record<string, HTMLElement | undefined>;

/** Alpine adds `$refs` to every component; an object literal of methods does not know it. */
export function refsOf(component: object): Refs {
	return (component as { $refs: Refs }).$refs;
}
