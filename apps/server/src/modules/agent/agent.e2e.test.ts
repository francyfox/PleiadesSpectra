import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
	agentToolNames,
	type BridgeRequest,
	bridgeUrlForToken,
} from "@repo/protocol";
import { Elysia } from "elysia";
import { createAgentRoutes } from "./agent-routes";

const TOKEN = "c".repeat(48);
const EXTENSION_ORIGIN = "chrome-extension://abcdefghijklmnop";

const VALID_PLUGIN = `// ==Reaction==
// @name      Smile to like
// @match     *://example.com/*
// @gestures  smile
// ==/Reaction==

reaction("like").onVisible(".like-popup", async (ctx) => {
  await ctx.ask("Like this page?", { expect: ["smile"] });
});
`;

let server: ReturnType<typeof Elysia.prototype.listen>;
let port: number;

beforeAll(() => {
	server = new Elysia()
		.use(createAgentRoutes())
		.listen({ port: 0, hostname: "127.0.0.1" });
	port = server.server?.port ?? 0;
});

afterAll(() => void server.stop());

type PageAnswer = (request: BridgeRequest) => unknown;

/** Stands in for the extension's Scripts page: answers every request with what `answer` returns. */
async function openPage(answer: PageAnswer, seen: BridgeRequest[] = []) {
	const url = bridgeUrlForToken(TOKEN).replace("3001", String(port));
	const socket = new WebSocket(url, {
		headers: { Origin: EXTENSION_ORIGIN },
	} as unknown as string[]);
	socket.onmessage = (event) => {
		const request = JSON.parse(String(event.data)) as BridgeRequest;
		seen.push(request);
		socket.send(
			JSON.stringify({ id: request.id, ok: true, result: answer(request) }),
		);
	};
	await new Promise<void>((resolve, reject) => {
		socket.onopen = () => resolve();
		socket.onerror = () => reject(new Error("page could not connect"));
	});
	return socket;
}

async function connectAgent(token = TOKEN): Promise<Client> {
	const client = new Client({ name: "test-agent", version: "0.0.0" });
	await client.connect(
		new StreamableHTTPClientTransport(
			new URL(`http://127.0.0.1:${port}/mcp/${token}`),
		),
	);
	return client;
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
	const [first] = result.content as Array<{ text: string }>;
	return first?.text ?? "";
}

describe("agent connector", () => {
	test("an unknown URL is refused, a known one works", async () => {
		const unknown = await fetch(
			`http://127.0.0.1:${port}/mcp/${"d".repeat(48)}`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{}",
			},
		);
		expect(unknown.status).toBe(404);

		const page = await openPage(() => []);
		const agent = await connectAgent();
		const tools = await agent.listTools();
		await agent.close();
		page.close();

		expect(tools.tools.map((tool) => tool.name)).toContain(
			agentToolNames.propose,
		);
	});

	test("an agent reads installed scripts from the live page", async () => {
		const summary = [
			{ id: "p1", enabled: true, header: { name: "Smile to like" } },
		];
		const page = await openPage(() => summary);
		const agent = await connectAgent();

		const result = await agent.callTool({
			name: agentToolNames.list,
			arguments: {},
		});
		await agent.close();
		page.close();

		expect(JSON.parse(textOf(result))).toEqual(summary);
	});

	test("an invalid proposal never reaches the user; a valid one returns the user's decision", async () => {
		const seen: BridgeRequest[] = [];
		const page = await openPage(() => "installed", seen);
		const agent = await connectAgent();

		const invalid = await agent.callTool({
			name: agentToolNames.propose,
			arguments: { source: "reaction('no header');" },
		});
		const valid = await agent.callTool({
			name: agentToolNames.propose,
			arguments: { source: VALID_PLUGIN },
		});
		await agent.close();
		page.close();

		expect(invalid.isError).toBe(true);
		expect(seen).toHaveLength(1);
		expect(seen[0]?.name).toBe(agentToolNames.propose);
		expect(JSON.parse(textOf(valid))).toBe("installed");
	});

	test("with the toggle off the agent is told how to turn it on", async () => {
		const page = await openPage(() => []);
		page.close();
		await Bun.sleep(50);
		const agent = await connectAgent();

		const result = await agent.callTool({
			name: agentToolNames.list,
			arguments: {},
		});
		await agent.close();

		expect(result.isError).toBe(true);
		expect(textOf(result)).toContain("Expose to agents");
	});

	test("a website cannot talk to the connector", async () => {
		const mcp = await fetch(`http://127.0.0.1:${port}/mcp/${TOKEN}`, {
			method: "POST",
			headers: {
				Origin: "https://evil.example",
				"content-type": "application/json",
			},
			body: "{}",
		});
		const rebinding = await fetch(`http://127.0.0.1:${port}/mcp/${TOKEN}`, {
			method: "POST",
			headers: { Host: "evil.example", "content-type": "application/json" },
			body: "{}",
		});
		const socket = new WebSocket(`ws://127.0.0.1:${port}/agent/${TOKEN}`, {
			headers: { Origin: "https://evil.example" },
		} as unknown as string[]);
		const refused = await new Promise<boolean>((resolve) => {
			socket.onopen = () => resolve(false);
			socket.onerror = () => resolve(true);
			socket.onclose = () => resolve(true);
		});

		expect(mcp.status).toBe(403);
		expect(rebinding.status).toBe(403);
		expect(refused).toBe(true);
	});
});
