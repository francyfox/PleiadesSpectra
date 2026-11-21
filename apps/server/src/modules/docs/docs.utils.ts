import packageJson from "../../../package.json";

export const DOCS_PATH = "/docs";
export const DOCS_SPEC_PATH = "/docs/json";
export const DOCS_ASYNCAPI_PATH = "/docs/asyncapi.json";

export const DOCS_TAGS = [
	{
		name: "stream",
		description:
			"Video frames from the browser extension in, SmartSpectra metrics and gestures out. The WebSocket `/ws` is described in the **WebSocket (AsyncAPI)** section.",
	},
	{
		name: "agent",
		description:
			"Agent connector: lets an external agent read the current gestures and metrics. The extension bridge WebSocket `/agent/{token}` is described in the **WebSocket (AsyncAPI)** section.",
	},
	{
		name: "system",
		description:
			"Service routes: health and general information about the server.",
	},
];

/**
 * Builds the `info` block of the OpenAPI document.
 * The version is taken from the server package.json.
 */
export function buildDocsInfo() {
	return {
		title: "PleiadesSpectra server",
		version: packageJson.version,
		description:
			"Local server of the browser extension. It receives video frames from the browser, " +
			"computes SmartSpectra metrics, serves gestures and hosts the agent connector. " +
			"The server listens on the loopback interface only (127.0.0.1) and is not reachable from other machines. " +
			"This section covers the HTTP routes; the WebSocket channels (`/ws`, `/agent/{token}`) are described in the **WebSocket (AsyncAPI)** section.",
	};
}

/**
 * Builds the `servers` block: the single loopback address the server listens on.
 */
export function buildDocsServers(port: number) {
	return [
		{ url: `http://127.0.0.1:${port}`, description: "Local loopback only" },
	];
}

/** Address of the Scalar client for the server at `origin`, e.g. `http://127.0.0.1:3001`. */
export function docsUrl(origin: string): string {
	return `${origin}${DOCS_PATH}`;
}

/** The line printed under the startup banner so the documentation is one click away. */
export function docsAnnouncement(origin: string): string {
	return `📖  API docs: ${docsUrl(origin)}`;
}

/**
 * `detail` of a route that must stay out of the OpenAPI spec: WebSocket routes (Elysia would emit them under
 * a non-standard `ws` method that Scalar cannot draw; they live in the AsyncAPI document) and the 405 stubs.
 */
export const HIDDEN_FROM_DOCS = { hide: true };

/**
 * Scalar bundle the `/docs` page loads. Pinned instead of `latest` because AsyncAPI documents
 * (scalar/scalar#7080, closed 2026-08-06) only render in recent releases, and a silent upgrade could change the page.
 */
export const SCALAR_BUNDLE_VERSION = "1.82.1";

/** The two documents of the single Scalar reference: HTTP routes and WebSocket channels. */
export function scalarSources() {
	return [
		{ title: "HTTP API", slug: "http", url: DOCS_SPEC_PATH, default: true },
		{
			title: "WebSocket (AsyncAPI)",
			slug: "websocket",
			url: DOCS_ASYNCAPI_PATH,
		},
	];
}
