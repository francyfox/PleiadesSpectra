import type { PluginHeader } from "./plugin";

/**
 * AI agent connector, modelled on SheetCanvas (see docs/agent-connector.md).
 *
 * - The extension's Scripts page mints a secret token and shows the MCP URL `mcpUrlForToken(token)`.
 * - While "Expose to agents" is on, that page keeps one WebSocket to `bridgeUrlForToken(token)`.
 *   Connecting = exposing, closing = hiding. The page (a tab, not the service worker) owns the live state.
 * - An MCP client calls the URL; tools that need live state are forwarded over the socket as
 *   `BridgeRequest` and answered with `BridgeResponse`.
 * - Agents never install anything on their own: `propose_script` opens the normal install dialog and
 *   resolves only after the user decided.
 */
export const AGENT_MCP_BASE_URL = "http://localhost:3001/mcp";
export const AGENT_BRIDGE_BASE_URL = "ws://localhost:3001/agent";

/** 24 random bytes as 48 lowercase hex characters. */
export const AGENT_TOKEN_PATTERN = /^[a-f0-9]{48}$/;

export function mcpUrlForToken(token: string): string {
	return `${AGENT_MCP_BASE_URL}/${token}`;
}

export function bridgeUrlForToken(token: string): string {
	return `${AGENT_BRIDGE_BASE_URL}/${token}`;
}

/** Close code: another Scripts page took this token. The old page must NOT reconnect. */
export const BRIDGE_CLOSE_REPLACED = 4000;
/** Close code: the token was regenerated. The server forgets it, so the old MCP URL stops working. */
export const BRIDGE_CLOSE_REVOKED = 4001;
export const BRIDGE_PING = "ping";
export const BRIDGE_PONG = "pong";
export const BRIDGE_HEARTBEAT_MS = 20_000;
export const BRIDGE_PONG_TIMEOUT_MS = 10_000;
export const BRIDGE_RECONNECT_BASE_MS = 1_000;
export const BRIDGE_RECONNECT_MAX_MS = 30_000;
export const BRIDGE_REQUEST_TIMEOUT_MS = 30_000;
/** How long `propose_script` waits for the user to decide. */
export const PROPOSAL_WAIT_MS = 120_000;

/** MCP tool names, shared so the docs, the server and tests agree. */
export const agentToolNames = {
	/** Server-local: rules, typings and examples for writing a script. */
	getGuide: "get_script_guide",
	/** Server-local: `parseHeader` check, the code is never executed. */
	validate: "validate_script",
	/** Bridge: installed scripts (`PluginSummary[]`). */
	list: "list_scripts",
	/** Bridge: full source of one installed script, to edit it. */
	get: "get_script",
	/** Bridge: opens the install dialog; resolves after the user installs or declines. */
	propose: "propose_script",
} as const;

/** Tools executed by the Scripts page. */
export type BridgeToolName =
	| typeof agentToolNames.list
	| typeof agentToolNames.get
	| typeof agentToolNames.propose;

export interface PluginSummary {
	id: string;
	enabled: boolean;
	header: PluginHeader;
}

/** What `propose_script` resolves with. */
export type ProposalOutcome = "installed" | "declined" | "pending";

/** Server → Scripts page, text JSON. */
export interface BridgeRequest {
	id: string;
	name: BridgeToolName;
	input: Record<string, unknown>;
}

/** Scripts page → server, text JSON. */
export type BridgeResponse =
	| { id: string; ok: true; result: unknown }
	| { id: string; ok: false; error: string };
