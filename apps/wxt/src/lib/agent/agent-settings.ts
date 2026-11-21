import { browser } from "wxt/browser";

const SETTINGS_KEY = "agentConnector";
const TOKEN_BYTES = 24;

export interface AgentSettings {
	token: string | null;
	enabled: boolean;
}

export const emptyAgentSettings: AgentSettings = {
	token: null,
	enabled: false,
};

/** 24 random bytes as 48 lowercase hex characters, the shape the server accepts. */
export function createAgentToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
		"",
	);
}

export async function loadAgentSettings(): Promise<AgentSettings> {
	const stored = await browser.storage.local.get(SETTINGS_KEY);
	const value = stored[SETTINGS_KEY] as Partial<AgentSettings> | undefined;
	if (typeof value?.token !== "string") return emptyAgentSettings;
	return { token: value.token, enabled: value.enabled === true };
}

export async function saveAgentSettings(
	settings: AgentSettings,
): Promise<void> {
	await browser.storage.local.set({ [SETTINGS_KEY]: settings });
}
