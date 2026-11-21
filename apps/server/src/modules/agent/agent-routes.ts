import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { AGENT_TOKEN_PATTERN } from "@repo/protocol";
import { Elysia } from "elysia";
import { HIDDEN_FROM_DOCS } from "#modules/docs/docs.utils";
import { mcpPostDetail } from "./agent.docs";
import {
	bridgeHeaders,
	forbiddenResponse,
	mcpHeaders,
	mcpSuccessResponse,
	mcpTransportErrorResponse,
	methodNotAllowedResponse,
	notFoundResponse,
	tokenParams,
} from "./agent.schemas";
import {
	type AgentBridge,
	type BridgeSocket,
	createAgentBridge,
} from "./agent-bridge";
import { createAgentMcpServer } from "./agent-tools";
import { type GuardedArea, isRequestAllowed } from "./request-guard";

const FORBIDDEN = () => new Response("Forbidden", { status: 403 });
const NOT_FOUND = () => new Response("Not found", { status: 404 });
const METHOD_NOT_ALLOWED = () =>
	new Response("Method not allowed", {
		status: 405,
		headers: { allow: "POST" },
	});

/** Stateless Streamable HTTP: a fresh server and transport per request, closed once the reply is built. */
async function handleMcpRequest(
	request: Request,
	bridge: AgentBridge,
	token: string,
): Promise<Response> {
	const server = createAgentMcpServer(bridge, token);
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
	});
	await server.connect(transport);
	try {
		return await transport.handleRequest(request);
	} finally {
		void server.close();
	}
}

/** The first problem with an incoming request, or null when it may proceed. */
function rejectionFor(
	request: Request,
	area: GuardedArea,
	token: string,
): Response | null {
	if (!isRequestAllowed(request, area)) return FORBIDDEN();
	if (!AGENT_TOKEN_PATTERN.test(token)) return NOT_FOUND();
	return null;
}

/** Elysia parses JSON frames into objects; the bridge works on the original text. */
function toText(raw: unknown): string {
	return typeof raw === "string" ? raw : JSON.stringify(raw);
}

/** Elysia keeps one wrapper per message; the bridge needs the same object for a socket's whole life. */
function toBridgeSocket(ws: {
	send(data: string): unknown;
	close(code?: number, reason?: string): unknown;
}): BridgeSocket {
	return {
		send: (text) => void ws.send(text),
		close: (code, reason) => void ws.close(code, reason),
	};
}

/**
 * `POST /mcp/<token>` is the connector agents call; `ws://…/agent/<token>` is the extension's Scripts page
 * holding the live state. See `docs/agent-connector.md` and `@repo/protocol` (`agent-link.ts`).
 */
export function createAgentRoutes(bridge: AgentBridge = createAgentBridge()) {
	const sockets = new Map<string, BridgeSocket>();

	return new Elysia()
		.post(
			"/mcp/:token",
			({ request, params }) => {
				const rejection = rejectionFor(request, "mcp", params.token);
				if (rejection) return rejection;
				if (!bridge.isKnown(params.token)) return NOT_FOUND();
				return handleMcpRequest(request, bridge, params.token);
			},
			{
				params: tokenParams,
				headers: mcpHeaders,
				response: {
					200: mcpSuccessResponse,
					400: mcpTransportErrorResponse,
					403: forbiddenResponse,
					404: notFoundResponse,
				},
				detail: mcpPostDetail,
			},
		)
		.get("/mcp/:token", METHOD_NOT_ALLOWED, {
			params: tokenParams,
			headers: mcpHeaders,
			response: { 405: methodNotAllowedResponse },
			detail: HIDDEN_FROM_DOCS,
		})
		.delete("/mcp/:token", METHOD_NOT_ALLOWED, {
			params: tokenParams,
			headers: mcpHeaders,
			response: { 405: methodNotAllowedResponse },
			detail: HIDDEN_FROM_DOCS,
		})
		.ws("/agent/:token", {
			params: tokenParams,
			headers: bridgeHeaders,
			detail: HIDDEN_FROM_DOCS,
			beforeHandle({ request, params }) {
				return rejectionFor(request, "bridge", params.token) ?? undefined;
			},
			open(ws) {
				const socket = toBridgeSocket(ws);
				sockets.set(ws.id, socket);
				bridge.attach(ws.data.params.token, socket);
			},
			message(ws, raw) {
				const socket = sockets.get(ws.id);
				if (socket) bridge.receive(socket, toText(raw));
			},
			close(ws, code) {
				const socket = sockets.get(ws.id);
				sockets.delete(ws.id);
				if (socket) bridge.detach(socket, code);
			},
		});
}

export const agentRoutes = createAgentRoutes();
