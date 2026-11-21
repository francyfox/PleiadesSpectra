import { AGENT_TOKEN_PATTERN } from "@repo/protocol";
import { t } from "elysia";

const EXAMPLE_TOKEN = "3f9a1c0e7b2d4a6c8e5f1b0d9a7c3e2f4b6d8a0c1e3f5a7b";

/**
 * Path parameters of every agent route. The format is documented but not enforced by the schema:
 * a malformed token must still answer 404 (see `rejectionFor`), not 422.
 */
export const tokenParams = t.Object({
	token: t.String({
		title: "Agent token",
		description: `Secret minted by the extension's Scripts page: 24 random bytes as 48 lowercase hex characters (\`${AGENT_TOKEN_PATTERN}\`). It is the only credential of the connector.`,
		examples: [EXAMPLE_TOKEN],
	}),
});

/** The plain-text bodies of the guard answers, shared by every route. */
const errorBody = (description: string, example: string) =>
	t.String({ description, examples: [example] });

/** Reusable error responses. The server answers them as plain text, not JSON. */
export const forbiddenResponse = errorBody(
	"The request failed the loopback guard: the `Host` header is not `localhost`, `127.0.0.1` or `[::1]` (DNS rebinding), or the `Origin` header is not acceptable for this area (`/mcp`: any `Origin` is refused; `/agent`: only `chrome-extension://` and `moz-extension://` are accepted).",
	"Forbidden",
);

export const notFoundResponse = errorBody(
	"The token does not match the 48 lowercase hex characters format, or no Scripts page has ever connected with it (or it was revoked by regenerating the token).",
	"Not found",
);

export const methodNotAllowedResponse = errorBody(
	"The connector is stateless and has no SSE stream or session to close. Only `POST` is supported; the `Allow: POST` header says so.",
	"Method not allowed",
);

/**
 * Header parameters of the MCP routes. Both are optional strings so validation can never pass or fail
 * differently from the guard, which answers 403 on its own.
 */
export const mcpHeaders = t.Object({
	host: t.Optional(
		t.String({
			description:
				"Must be a loopback name. Any HTTP client sets it automatically.",
			examples: ["127.0.0.1:3001", "localhost:3001"],
		}),
	),
	origin: t.Optional(
		t.String({
			description:
				"Must be absent. MCP clients are not browsers and send no `Origin`; a browser page always does, so any value means a website is calling and is refused with 403.",
			examples: ["https://evil.example"],
		}),
	),
});

/** Header parameters of the WebSocket route. */
export const bridgeHeaders = t.Object({
	host: t.Optional(
		t.String({
			description: "Must be a loopback name.",
			examples: ["localhost:3001"],
		}),
	),
	origin: t.Optional(
		t.String({
			description:
				"Must be the extension's own origin (`chrome-extension://<id>` or `moz-extension://<id>`). A browser always sets it on a WebSocket and a web page cannot forge it, so websites are refused with 403.",
			examples: ["chrome-extension://abcdefghijklmnop"],
		}),
	),
	upgrade: t.Optional(
		t.String({ description: "Must be `websocket`.", examples: ["websocket"] }),
	),
});

const jsonRpcId = t.Union([t.Number(), t.String()], {
	description: "Request id chosen by the client; echoed in the response.",
	examples: [1],
});

/** JSON-RPC 2.0 request body accepted by `POST /mcp/{token}`. */
export const mcpRequestBody = t.Object(
	{
		jsonrpc: t.Literal("2.0", { description: "Always the string `2.0`." }),
		id: t.Optional(jsonRpcId),
		method: t.String({
			description:
				"MCP method: `initialize`, `tools/list`, `tools/call`, `ping`, or a `notifications/*` message (no `id`, answered with 202).",
			examples: ["tools/call"],
		}),
		params: t.Optional(
			t.Record(t.String(), t.Unknown(), {
				description:
					"Method parameters. For `tools/call`: `{ name, arguments }`.",
				examples: [{ name: "list_scripts", arguments: {} }],
			}),
		),
	},
	{
		title: "MCP JSON-RPC request",
		description:
			"One JSON-RPC 2.0 message of the Model Context Protocol. A batch (array) is also accepted by the MCP transport.",
		examples: [
			{
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: { name: "list_scripts", arguments: {} },
			},
			{ jsonrpc: "2.0", id: 2, method: "tools/list" },
		],
	},
);

/** JSON-RPC 2.0 response with the tool result in `result.content`. */
export const mcpSuccessResponse = t.Object(
	{
		jsonrpc: t.Literal("2.0"),
		id: jsonRpcId,
		result: t.Record(t.String(), t.Unknown(), {
			description:
				"MCP result. For `tools/call`: `content` (a list of `{ type: 'text', text }` parts) and `isError: true` when the tool failed, e.g. the extension is not connected.",
		}),
	},
	{
		title: "MCP JSON-RPC response",
		description:
			"Returned as a single JSON object (the transport runs with JSON responses, not an SSE stream). A failed tool is still HTTP 200 with `result.isError: true`.",
		examples: [
			{
				jsonrpc: "2.0",
				id: 1,
				result: {
					content: [
						{
							type: "text",
							text: '[{"id":"p1","enabled":true,"header":{"name":"Smile to like"}}]',
						},
					],
				},
			},
			{
				jsonrpc: "2.0",
				id: 1,
				result: {
					isError: true,
					content: [
						{
							type: "text",
							text: "The extension is not connected. Ask the user to open the Scripts page in the extension and turn on “Expose to agents”, then retry.",
						},
					],
				},
			},
		],
	},
);

/** A JSON-RPC error produced by the MCP transport itself for a malformed request. */
export const mcpTransportErrorResponse = t.Object(
	{
		jsonrpc: t.Literal("2.0"),
		id: t.Null(),
		error: t.Object({
			code: t.Number({
				description: "JSON-RPC error code.",
				examples: [-32700],
			}),
			message: t.String({ examples: ["Parse error: Invalid JSON"] }),
		}),
	},
	{
		title: "MCP transport error",
		description:
			"The request passed the guard but is not a valid MCP message (bad JSON, missing `Accept: application/json, text/event-stream`, unsupported content type, invalid JSON-RPC). The status is chosen by the MCP SDK transport (400, 406 or 415).",
		examples: [
			{
				jsonrpc: "2.0",
				id: null,
				error: { code: -32700, message: "Parse error: Invalid JSON" },
			},
		],
	},
);

/** WebSocket frames, documented for the `/agent/{token}` route. */
export const bridgeRequestFrame = t.Object(
	{
		id: t.String({
			description: "Call id (UUID); the page must echo it in its answer.",
			examples: ["0b1d6f1e-8a52-4a0e-9e0d-3c5f0c6b7a11"],
		}),
		name: t.Union(
			[
				t.Literal("list_scripts"),
				t.Literal("get_script"),
				t.Literal("propose_script"),
			],
			{ description: "Tool the Scripts page has to run." },
		),
		input: t.Record(t.String(), t.Unknown(), {
			description: "Tool arguments: `{}`, `{ id }` or `{ source }`.",
		}),
	},
	{
		title: "BridgeRequest (server to page)",
		examples: [
			{
				id: "0b1d6f1e-8a52-4a0e-9e0d-3c5f0c6b7a11",
				name: "get_script",
				input: { id: "p1" },
			},
		],
	},
);

export const bridgeResponseFrame = t.Union(
	[
		t.Object({
			id: t.String(),
			ok: t.Literal(true),
			result: t.Unknown({ description: "Anything JSON-serialisable." }),
		}),
		t.Object({ id: t.String(), ok: t.Literal(false), error: t.String() }),
	],
	{
		title: "BridgeResponse (page to server)",
		examples: [
			{
				id: "0b1d6f1e-8a52-4a0e-9e0d-3c5f0c6b7a11",
				ok: true,
				result: { id: "p1", enabled: true },
			},
			{
				id: "0b1d6f1e-8a52-4a0e-9e0d-3c5f0c6b7a11",
				ok: false,
				error: "Script not found",
			},
		],
	},
);
