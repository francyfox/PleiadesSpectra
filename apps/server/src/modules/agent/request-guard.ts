const EXTENSION_ORIGIN = /^(chrome|moz)-extension:\/\//;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** `mcp`: the connector agents call. `bridge`: the extension page's WebSocket. */
export type GuardedArea = "mcp" | "bridge";

function hostnameOf(hostHeader: string): string {
	return hostHeader.startsWith("[")
		? hostHeader.slice(0, hostHeader.indexOf("]") + 1)
		: (hostHeader.split(":")[0] ?? "");
}

/** Blocks DNS rebinding: the request must have been addressed to the loopback name. */
export function isLoopbackHost(hostHeader: string | null): boolean {
	return hostHeader !== null && LOOPBACK_HOSTS.has(hostnameOf(hostHeader));
}

export function isExtensionOrigin(origin: string | null): origin is string {
	return origin !== null && EXTENSION_ORIGIN.test(origin);
}

/**
 * Any website can send requests to localhost. MCP clients are not browsers and send no `Origin`,
 * so any browser origin is refused there. The bridge is the opposite: a browser always sets `Origin`
 * on a WebSocket and a page cannot forge it, so only the extension's own origin may connect.
 */
export function isRequestAllowed(request: Request, area: GuardedArea): boolean {
	if (!isLoopbackHost(request.headers.get("host"))) return false;
	const origin = request.headers.get("origin");
	return area === "mcp" ? origin === null : isExtensionOrigin(origin);
}
