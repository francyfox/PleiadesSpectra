import {
	BRIDGE_CLOSE_REVOKED,
	type BridgeRequest,
	type BridgeResponse,
	bridgeUrlForToken,
	mcpUrlForToken,
} from "@repo/protocol";
import {
	type AgentSettings,
	createAgentToken,
	emptyAgentSettings,
} from "./agent-settings";
import type { BridgeClient, BridgeStatus } from "./bridge-client";

export interface AgentConnectionState {
	token: string | null;
	enabled: boolean;
	status: BridgeStatus;
	mcpUrl: string | null;
}

export interface AgentConnectionDeps {
	load(): Promise<AgentSettings>;
	save(settings: AgentSettings): Promise<void>;
	createClient(options: {
		url: string;
		onRequest(request: BridgeRequest): Promise<BridgeResponse>;
		onStatus(status: BridgeStatus): void;
	}): BridgeClient;
	onRequest(request: BridgeRequest): Promise<BridgeResponse>;
	onChange(state: AgentConnectionState): void;
}

export interface AgentConnection {
	/** Loads the saved token and reconnects if “Expose to agents” was left on. */
	init(): Promise<void>;
	generate(): Promise<void>;
	setEnabled(enabled: boolean): Promise<void>;
	/** A new token; the old URL stops working. */
	regenerate(): Promise<void>;
}

/**
 * The Scripts page's side of the connector: one token, the “Expose to agents” switch and the socket
 * that runs while the switch is on, even when the dialog is closed.
 */
export function createAgentConnection(
	deps: AgentConnectionDeps,
): AgentConnection {
	let settings = emptyAgentSettings;
	let status: BridgeStatus = "disconnected";
	let client: BridgeClient | null = null;

	function publish(): void {
		deps.onChange({
			token: settings.token,
			enabled: settings.enabled,
			status,
			mcpUrl: settings.token ? mcpUrlForToken(settings.token) : null,
		});
	}

	function disconnect(code?: number): void {
		client?.stop(code);
		client = null;
	}

	function connect(): void {
		if (!settings.token || !settings.enabled) return;
		client = deps.createClient({
			url: bridgeUrlForToken(settings.token),
			onRequest: deps.onRequest,
			onStatus: (next) => {
				status = next;
				publish();
			},
		});
		client.start();
	}

	async function update(
		next: AgentSettings,
		closeCode?: number,
	): Promise<void> {
		disconnect(closeCode);
		settings = next;
		await deps.save(settings);
		publish();
		connect();
	}

	return {
		async init() {
			settings = await deps.load();
			publish();
			connect();
		},
		generate: () => update({ token: createAgentToken(), enabled: true }),
		setEnabled: (enabled) => update({ ...settings, enabled }),
		regenerate: () =>
			update(
				{ token: createAgentToken(), enabled: settings.enabled },
				BRIDGE_CLOSE_REVOKED,
			),
	};
}
