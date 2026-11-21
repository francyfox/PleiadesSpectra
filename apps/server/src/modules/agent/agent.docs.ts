import { mcpRequestBody } from "./agent.schemas";

const AGENT_TAGS = ["agent"];

/** TypeBox schemas are valid JSON Schema, but their static type is not the spec's `SchemaObject`. */
function asSpecSchema(schema: object): never {
	return schema as never;
}

const MCP_TOOLS_TABLE = `| Tool | Runs on | Input | What it does |
| --- | --- | --- | --- |
| \`get_script_guide\` | server | none | Rules, typings and examples for writing a script. Read it first. |
| \`validate_script\` | server | \`source\` (string, max 64 KiB) | Checks the \`==Reaction==\` header without executing the code and reports what the script would be allowed to do. |
| \`list_scripts\` | extension page | none | Installed scripts: \`id\`, \`enabled\`, \`header\`. |
| \`get_script\` | extension page | \`id\` (from \`list_scripts\`) | Full source of one installed script. |
| \`propose_script\` | extension page | \`source\` (string, max 64 KiB) | Validates the script, then opens the install dialog and waits up to 120 s for the user: \`installed\`, \`declined\` or \`pending\`. Nothing is installed without the user's confirmation. |

Tools that run on the extension page are forwarded over the WebSocket (\`/agent/{token}\`), one at a time, with a 30 s timeout (120 s for \`propose_script\`). If the page is not connected the tool fails with \`isError: true\` and asks the user to turn on **Expose to agents**.`;

/** OpenAPI `detail` of `POST /mcp/{token}`. */
export const mcpPostDetail = {
	tags: AGENT_TAGS,
	summary: "MCP endpoint for agents",
	requestBody: {
		required: true,
		description:
			"One JSON-RPC 2.0 message (or a batch) of the Model Context Protocol.",
		content: { "application/json": { schema: asSpecSchema(mcpRequestBody) } },
	},
	description: `Model Context Protocol server over **Streamable HTTP**, used by AI agents (Claude, Cursor and other MCP clients) to read and propose browser-extension scripts.

**Who calls it:** an agent connector. The user copies the URL \`http://localhost:3001/mcp/<token>\` from the extension's Scripts page into their MCP client.

**How it works**
- Stateless: a fresh MCP server and transport are created per request, there is no session id and no SSE stream. Replies are plain JSON (\`enableJsonResponse\`).
- Only \`POST\` is served: \`GET\` and \`DELETE\` on this path answer **405** with \`Allow: POST\`, because there is no SSE stream or session to open or close.
- Send JSON-RPC 2.0 messages: \`initialize\`, \`tools/list\`, \`tools/call\`. Notifications (no \`id\`) are answered with 202 and an empty body.
- The client should send \`Content-Type: application/json\` and \`Accept: application/json, text/event-stream\`.

**Security (checked in this order)**
1. \`Host\` must be a loopback name, otherwise **403** (DNS rebinding protection).
2. \`Origin\` must be absent, otherwise **403** (websites cannot call the connector).
3. The token must be 48 lowercase hex characters, otherwise **404**.
4. The token must be known, i.e. a Scripts page has connected with it and it was not revoked, otherwise **404**. The token is compared in constant time.

The server listens on 127.0.0.1 only.

**Tools**

${MCP_TOOLS_TABLE}

**Example: list scripts**

\`\`\`json
{ "jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": { "name": "list_scripts", "arguments": {} } }
\`\`\`

Response:

\`\`\`json
{ "jsonrpc": "2.0", "id": 1, "result": { "content": [ { "type": "text", "text": "[{\\"id\\":\\"p1\\",\\"enabled\\":true,\\"header\\":{\\"name\\":\\"Smile to like\\"}}]" } ] } }
\`\`\``,
};

/** Markdown description of the `/agent/{token}` channel in the AsyncAPI document. */
export const AGENT_CHANNEL_DESCRIPTION = `\`ws://localhost:3001/agent/<token>\` is held open by the extension's **Scripts page** (a browser tab, not the service worker) while **Expose to agents** is on. Connecting means "expose", closing means "hide". It is not meant for agents: they use \`POST /mcp/{token}\`.

**Why it exists:** the live script state (installed scripts, the install dialog) belongs to the page, so MCP tools that need it (\`list_scripts\`, \`get_script\`, \`propose_script\`) are relayed to the page through this socket.

**Handshake**
- Rejected before the upgrade: **403** for a bad \`Host\` or an \`Origin\` that is not an extension, **404** for a malformed token.
- A new page with the same token replaces the old one: the old socket is closed with code **4000** and must not reconnect, its pending calls fail.
- Closing with code **4001** means the token was regenerated: the server forgets it and the old MCP URL starts answering 404.
- Closing a socket fails its pending calls with "The Scripts page disconnected during the call".

**Messages (text frames)**
- Server to page, a call: \`{ "id": "<uuid>", "name": "list_scripts" | "get_script" | "propose_script", "input": {...} }\`.
- Page to server, the answer with the same id: \`{ "id": "<uuid>", "ok": true, "result": ... }\` or \`{ "id": "<uuid>", "ok": false, "error": "..." }\`.
- Heartbeat: page sends the text \`ping\` (every 20 s), the server replies \`pong\`.
- Calls run one at a time; no answer within 30 s (120 s for \`propose_script\`) fails the call with a timeout error. Unparseable frames and answers for unknown ids are ignored.

**Example**

\`\`\`
server -> page  {"id":"0b1d6f1e-8a52-4a0e-9e0d-3c5f0c6b7a11","name":"get_script","input":{"id":"p1"}}
page -> server  {"id":"0b1d6f1e-8a52-4a0e-9e0d-3c5f0c6b7a11","ok":true,"result":"// ==Reaction==\\n..."}
page -> server  ping
server -> page  pong
\`\`\``;
