import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
	agentToolNames,
	type BridgeRequest,
	bridgeUrlForToken,
	mcpUrlForToken,
} from "@repo/protocol";

/**
 * Manual check against a running server (`bun run dev`): a fake extension page connects to the bridge,
 * a real MCP client calls all five tools through the token URL.
 */
const TOKEN = Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) =>
	byte.toString(16).padStart(2, "0"),
).join("");
const EXTENSION_ORIGIN = "chrome-extension://mcp-check";

const VALID_PLUGIN = `// ==Reaction==
// @name      Smile to like
// @match     *://example.com/*
// @gestures  smile
// ==/Reaction==

reaction("like").onVisible(".like-popup", async (ctx) => {
  await ctx.ask("Like this page?", { expect: ["smile"] });
});
`;

const INSTALLED = [
	{ id: "demo", enabled: true, header: { name: "Demo", matches: ["*://*/*"] } },
];

function answerFor(request: BridgeRequest): unknown {
	if (request.name === agentToolNames.list) return INSTALLED;
	if (request.name === agentToolNames.get)
		return { id: request.input.id, source: VALID_PLUGIN };
	return "installed";
}

async function openFakePage(): Promise<WebSocket> {
	const socket = new WebSocket(bridgeUrlForToken(TOKEN), {
		headers: { Origin: EXTENSION_ORIGIN },
	} as unknown as string[]);
	socket.onmessage = (event) => {
		const request = JSON.parse(String(event.data)) as BridgeRequest;
		console.log(`  page ← ${request.name}`);
		socket.send(
			JSON.stringify({ id: request.id, ok: true, result: answerFor(request) }),
		);
	};
	await new Promise<void>((resolve, reject) => {
		socket.onopen = () => resolve();
		socket.onerror = () =>
			reject(new Error("The bridge refused the fake page"));
	});
	return socket;
}

function firstText(result: unknown): string {
	const content = (result as { content?: Array<{ text?: string }> }).content;
	return content?.[0]?.text ?? "";
}

async function callTool(
	client: Client,
	name: string,
	args: Record<string, unknown> = {},
) {
	const result = await client.callTool({ name, arguments: args });
	const text = firstText(result);
	console.log(`${name} isError=${result.isError ?? false}`);
	console.log(
		`  ${(text.length > 160 ? `${text.slice(0, 160)}…` : text).replace(/\n/g, "\n  ")}`,
	);
}

async function main() {
	const page = await openFakePage();
	const client = new Client({ name: "mcp-check", version: "0.0.0" });
	await client.connect(
		new StreamableHTTPClientTransport(new URL(mcpUrlForToken(TOKEN))),
	);

	console.log(
		"tools:",
		(await client.listTools()).tools.map((tool) => tool.name).join(", "),
	);
	await callTool(client, agentToolNames.getGuide);
	await callTool(client, agentToolNames.validate, { source: VALID_PLUGIN });
	await callTool(client, agentToolNames.list);
	await callTool(client, agentToolNames.get, { id: "demo" });
	await callTool(client, agentToolNames.propose, {
		source: "reaction('no header');",
	});
	await callTool(client, agentToolNames.propose, { source: VALID_PLUGIN });

	const wrongToken = await fetch(mcpUrlForToken("0".repeat(48)), {
		method: "POST",
	});
	const browserOrigin = await fetch(mcpUrlForToken(TOKEN), {
		method: "POST",
		headers: { Origin: "https://evil.example" },
	});
	console.log(
		`unknown token: ${wrongToken.status}, browser origin: ${browserOrigin.status}`,
	);

	await client.close();
	page.close();
}

await main();
