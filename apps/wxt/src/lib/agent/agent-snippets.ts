export type AgentTab = "claude" | "codex" | "custom";

export interface AgentSnippet {
	code: string;
	hint: string;
}

function customJson(mcpUrl: string): string {
	return JSON.stringify(
		{ mcpServers: { pleiades: { type: "http", url: mcpUrl } } },
		null,
		2,
	);
}

/** What the user pastes to add the connector to each kind of agent. */
export function snippetFor(tab: AgentTab, mcpUrl: string): AgentSnippet {
	switch (tab) {
		case "claude":
			return {
				code: `claude mcp add --transport http pleiades ${mcpUrl}`,
				hint: "Paste this in a terminal.",
			};
		case "codex":
			return {
				code: `codex mcp add pleiades --url ${mcpUrl}`,
				hint: "Paste this in a terminal. Codex keeps it in ~/.codex/config.toml.",
			};
		case "custom":
			return {
				code: customJson(mcpUrl),
				hint: "For any agent that takes MCP servers as JSON: paste it into that agent's MCP config.",
			};
	}
}

export function isAgentTab(value: unknown): value is AgentTab {
	return value === "claude" || value === "codex" || value === "custom";
}
