import {
	agentToolInputs,
	agentToolNames,
	type BridgeRequest,
	type BridgeResponse,
	type PluginSummary,
	type ProposalOutcome,
} from "@repo/protocol";
import { z } from "zod";
import { parseHeader } from "../plugins/reactions-adapter";
import type { InstalledPlugin } from "../plugins/types";

/** What the Scripts page lends to the agent: the installed scripts and the install dialog. */
export interface BridgeHandlerDeps {
	listPlugins(): Promise<InstalledPlugin[]>;
	/** Shows the install dialog; resolves once the user decided. Nothing is installed without them. */
	requestInstall(source: string): Promise<ProposalOutcome>;
}

const getInput = z.object(agentToolInputs[agentToolNames.get]);
const proposeInput = z.object(agentToolInputs[agentToolNames.propose]);

function succeed(request: BridgeRequest, result: unknown): BridgeResponse {
	return { id: request.id, ok: true, result };
}

function fail(request: BridgeRequest, error: string): BridgeResponse {
	return { id: request.id, ok: false, error };
}

function summarize(plugin: InstalledPlugin): PluginSummary {
	return { id: plugin.id, enabled: plugin.enabled, header: plugin.header };
}

async function getPlugin(
	request: BridgeRequest,
	deps: BridgeHandlerDeps,
): Promise<BridgeResponse> {
	const input = getInput.safeParse(request.input);
	if (!input.success) return fail(request, "get_script needs an `id`.");
	const plugins = await deps.listPlugins();
	const plugin = plugins.find((item) => item.id === input.data.id);
	if (!plugin) return fail(request, "No installed script has this id.");
	return succeed(request, { ...summarize(plugin), source: plugin.source });
}

async function proposePlugin(
	request: BridgeRequest,
	deps: BridgeHandlerDeps,
): Promise<BridgeResponse> {
	const input = proposeInput.safeParse(request.input);
	if (!input.success) return fail(request, "propose_script needs a `source`.");
	const header = parseHeader(input.data.source);
	if (!header.ok) return fail(request, header.error);
	return succeed(request, await deps.requestInstall(input.data.source));
}

/** Answers one request from the server; it only reads the store or opens the install dialog. */
export async function handleBridgeRequest(
	request: BridgeRequest,
	deps: BridgeHandlerDeps,
): Promise<BridgeResponse> {
	switch (request.name) {
		case agentToolNames.list:
			return succeed(request, (await deps.listPlugins()).map(summarize));
		case agentToolNames.get:
			return getPlugin(request, deps);
		case agentToolNames.propose:
			return proposePlugin(request, deps);
		default:
			return fail(request, `Unknown tool: ${String(request.name)}`);
	}
}
