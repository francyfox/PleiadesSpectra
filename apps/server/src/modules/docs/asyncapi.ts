import {
	agentChannel,
	agentMessages,
	agentOperations,
	agentSchemas,
} from "#modules/agent/agent.asyncapi";
import { config } from "#modules/config/config";
import {
	streamChannel,
	streamMessages,
	streamOperations,
	streamSchemas,
} from "#modules/stream/stream.asyncapi";
import { buildDocsInfo } from "./docs.utils";

const ASYNCAPI_VERSION = "3.0.0";
const WEBSOCKET_TAGS = [
	{
		name: "stream",
		description: "Camera frames from the browser extension in, gestures out.",
	},
	{
		name: "agent",
		description:
			"Bridge between the extension's Scripts page and the agent connector.",
	},
];

/** The single loopback server both channels live on. */
function buildAsyncApiServers(port: number) {
	return {
		local: {
			host: `127.0.0.1:${port}`,
			protocol: "ws",
			description:
				"Loopback only: the server listens on 127.0.0.1 and is not reachable from other machines.",
		},
	};
}

/** Same title and version as the OpenAPI document, with a description that covers the sockets. */
function buildAsyncApiInfo() {
	const { title, version } = buildDocsInfo();
	return {
		title: `${title}: WebSocket`,
		version,
		description:
			"WebSocket channels of the local server: `/ws` carries camera frames from the browser extension in and gestures out; " +
			"`/agent/{token}` is the bridge the extension's Scripts page holds open for the agent connector. " +
			"The HTTP routes are described in the **HTTP API** section.",
		tags: WEBSOCKET_TAGS,
	};
}

/**
 * AsyncAPI 3.0 document of the WebSocket routes. Elysia's OpenAPI script cannot describe `.ws()` routes,
 * so Scalar shows this document next to the OpenAPI one.
 */
export function buildAsyncApiDocument(port: number = config.PORT) {
	return {
		asyncapi: ASYNCAPI_VERSION,
		info: buildAsyncApiInfo(),
		servers: buildAsyncApiServers(port),
		channels: { stream: streamChannel, agent: agentChannel },
		operations: { ...streamOperations, ...agentOperations },
		components: {
			messages: { ...streamMessages, ...agentMessages },
			schemas: { ...streamSchemas, ...agentSchemas },
		},
	};
}
