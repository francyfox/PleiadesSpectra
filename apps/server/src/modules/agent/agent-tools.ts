import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
	agentToolAnnotations,
	agentToolDescriptions,
	agentToolInputs,
	agentToolNames,
	BRIDGE_REQUEST_TIMEOUT_MS,
	type BridgeToolName,
	MCP_INSTRUCTIONS,
	PROPOSAL_WAIT_MS,
} from "@repo/protocol";
import type { AgentBridge } from "./agent-bridge";
import { checkPlugin, describeHeader } from "./check-plugin";
import { getPluginGuide } from "./plugin-guide";

type AgentToolName = (typeof agentToolNames)[keyof typeof agentToolNames];

const SERVER_INFO = { name: "pleiades-spectra", version: "0.0.0" };

function textResult(text: string): CallToolResult {
	return { content: [{ type: "text", text }] };
}

function errorResult(text: string): CallToolResult {
	return { content: [{ type: "text", text }], isError: true };
}

function validatePlugin({ source }: { source: string }): CallToolResult {
	const check = checkPlugin(source);
	return check.ok
		? textResult(`Valid.\n${describeHeader(check.header)}`)
		: errorResult(check.error);
}

/** Runs a tool on the extension page; a page that is not connected comes back as a readable error. */
async function callExtension(
	bridge: AgentBridge,
	token: string,
	name: BridgeToolName,
	input: Record<string, unknown>,
	timeoutMs = BRIDGE_REQUEST_TIMEOUT_MS,
): Promise<CallToolResult> {
	const response = await bridge.call(token, name, input, timeoutMs);
	return response.ok
		? textResult(JSON.stringify(response.result ?? { ok: true }))
		: errorResult(response.error);
}

function proposePlugin(bridge: AgentBridge, token: string) {
	return ({
		source,
	}: {
		source: string;
	}): Promise<CallToolResult> | CallToolResult => {
		const check = checkPlugin(source);
		if (!check.ok) return errorResult(check.error);
		return callExtension(
			bridge,
			token,
			agentToolNames.propose,
			{ source },
			PROPOSAL_WAIT_MS,
		);
	};
}

/** The MCP server is built per request (stateless transport) for one token. */
export function createAgentMcpServer(
	bridge: AgentBridge,
	token: string,
): McpServer {
	const server = new McpServer(SERVER_INFO, { instructions: MCP_INSTRUCTIONS });
	const describe = (name: AgentToolName) => ({
		description: agentToolDescriptions[name],
		inputSchema: agentToolInputs[name],
		annotations: agentToolAnnotations[name],
	});

	server.registerTool(
		agentToolNames.getGuide,
		describe(agentToolNames.getGuide),
		async () => textResult(await getPluginGuide()),
	);
	server.registerTool(
		agentToolNames.validate,
		describe(agentToolNames.validate),
		validatePlugin,
	);
	server.registerTool(agentToolNames.list, describe(agentToolNames.list), () =>
		callExtension(bridge, token, agentToolNames.list, {}),
	);
	server.registerTool(
		agentToolNames.get,
		describe(agentToolNames.get),
		({ id }: { id: string }) =>
			callExtension(bridge, token, agentToolNames.get, { id }),
	);
	server.registerTool(
		agentToolNames.propose,
		describe(agentToolNames.propose),
		proposePlugin(bridge, token),
	);

	return server;
}
