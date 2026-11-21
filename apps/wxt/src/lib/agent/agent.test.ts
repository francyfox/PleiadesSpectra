import { describe, expect, test } from "bun:test";
import {
	agentToolNames,
	BRIDGE_CLOSE_REPLACED,
	BRIDGE_CLOSE_REVOKED,
	BRIDGE_HEARTBEAT_MS,
	BRIDGE_PONG_TIMEOUT_MS,
	BRIDGE_RECONNECT_BASE_MS,
	type BridgeRequest,
	type BridgeResponse,
	bridgeUrlForToken,
	type PluginHeader,
} from "@repo/protocol";
import type { InstalledPlugin } from "../plugins/types";
import {
	type AgentConnectionState,
	createAgentConnection,
} from "./agent-connection";
import type { AgentSettings } from "./agent-settings";
import { snippetFor } from "./agent-snippets";
import {
	type BridgeClient,
	type BridgeStatus,
	createBridgeClient,
	type SocketLike,
} from "./bridge-client";
import { type BridgeHandlerDeps, handleBridgeRequest } from "./bridge-handler";
import { createProposalRegistry } from "./proposal-registry";

const HEADER: PluginHeader = {
	name: "Smile to like",
	author: null,
	matches: ["*://example.com/*"],
	camera: "on-demand",
	gestures: ["smile"],
};
const SOURCE = `// ==Reaction==
// @name      Smile to like
// @match     *://example.com/*
// @gestures  smile
// ==/Reaction==
reaction("like");`;
const INSTALLED: InstalledPlugin = {
	id: "p1",
	source: SOURCE,
	header: HEADER,
	enabled: true,
};

function request(name: BridgeRequest["name"], input = {}): BridgeRequest {
	return { id: "r1", name, input };
}

function createFakeTimers() {
	let now = 0;
	let nextId = 1;
	const tasks = new Map<number, { at: number; run(): void; every?: number }>();
	const schedule = (run: () => void, ms: number, every?: number) => {
		const id = nextId++;
		tasks.set(id, { at: now + ms, run, every });
		return id;
	};
	return {
		setTimeout: ((run: () => void, ms: number) =>
			schedule(run, ms)) as unknown as typeof setTimeout,
		setInterval: ((run: () => void, ms: number) =>
			schedule(run, ms, ms)) as unknown as typeof setInterval,
		clearTimeout: ((id: number) =>
			void tasks.delete(id)) as unknown as typeof clearTimeout,
		clearInterval: ((id: number) =>
			void tasks.delete(id)) as unknown as typeof clearInterval,
		advance(ms: number) {
			const end = now + ms;
			while (true) {
				const due = [...tasks.entries()]
					.filter(([, task]) => task.at <= end)
					.sort((a, b) => a[1].at - b[1].at)[0];
				if (!due) break;
				const [id, task] = due;
				now = task.at;
				if (task.every) task.at += task.every;
				else tasks.delete(id);
				task.run();
			}
			now = end;
		},
	};
}

class FakeSocket implements SocketLike {
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onclose: ((event: { code: number }) => void) | null = null;
	sent: string[] = [];
	closedWith: number | undefined | null = null;
	constructor(readonly url: string) {}
	send(text: string) {
		this.sent.push(text);
	}
	close(code?: number) {
		this.closedWith = code;
	}
	open() {
		this.onopen?.();
	}
	serverClose(code: number) {
		this.onclose?.({ code });
	}
	receive(data: unknown) {
		this.onmessage?.({ data });
	}
}

function createClientHarness() {
	const timers = createFakeTimers();
	const sockets: FakeSocket[] = [];
	const statuses: BridgeStatus[] = [];
	const client = createBridgeClient({
		url: "ws://test",
		createSocket: (url) => {
			const socket = new FakeSocket(url);
			sockets.push(socket);
			return socket;
		},
		onRequest: async (incoming) => ({
			id: incoming.id,
			ok: true,
			result: "done",
		}),
		onStatus: (status) => statuses.push(status),
		timers,
	});
	return { client, timers, sockets, statuses };
}

describe("what the agent can do on the Scripts page", () => {
	function deps(overrides: Partial<BridgeHandlerDeps> = {}) {
		const installs: string[] = [];
		const handlerDeps: BridgeHandlerDeps = {
			listPlugins: async () => [INSTALLED],
			requestInstall: async (source) => {
				installs.push(source);
				return "installed";
			},
			...overrides,
		};
		return { handlerDeps, installs };
	}

	test("it lists installed scripts without their code", async () => {
		const { handlerDeps } = deps();

		const response = await handleBridgeRequest(
			request(agentToolNames.list),
			handlerDeps,
		);

		expect(response).toEqual({
			id: "r1",
			ok: true,
			result: [{ id: "p1", enabled: true, header: HEADER }],
		});
	});

	test("it hands over one script's code only for a known id", async () => {
		const { handlerDeps } = deps();

		const known = await handleBridgeRequest(
			request(agentToolNames.get, { id: "p1" }),
			handlerDeps,
		);
		const unknown = await handleBridgeRequest(
			request(agentToolNames.get, { id: "nope" }),
			handlerDeps,
		);

		expect(known.ok && (known.result as { source: string }).source).toBe(
			SOURCE,
		);
		expect(unknown.ok).toBe(false);
	});

	test("an invalid proposal never reaches the user; a valid one returns their decision", async () => {
		const { handlerDeps, installs } = deps();

		const invalid = await handleBridgeRequest(
			request(agentToolNames.propose, { source: "reaction('x');" }),
			handlerDeps,
		);
		const valid = await handleBridgeRequest(
			request(agentToolNames.propose, { source: SOURCE }),
			handlerDeps,
		);

		expect(invalid.ok).toBe(false);
		expect(installs).toEqual([SOURCE]);
		expect(valid).toEqual({ id: "r1", ok: true, result: "installed" });
	});

	test("an unknown tool is refused", async () => {
		const { handlerDeps } = deps();

		const response = await handleBridgeRequest(
			request("delete_everything" as BridgeRequest["name"]),
			handlerDeps,
		);

		expect(response.ok).toBe(false);
	});
});

describe("agent proposals waiting for the user", () => {
	test("the agent gets the user's decision, or pending when they never answer", async () => {
		const timers = createFakeTimers();
		const registry = createProposalRegistry(timers);

		const decided = registry.open("a", 1000);
		registry.settle("a", "declined");
		const ignored = registry.open("b", 1000);
		timers.advance(1000);
		registry.settle("b", "installed");

		expect(await decided).toBe("declined");
		expect(await ignored).toBe("pending");
	});
});

describe("the connection to the server", () => {
	test("it answers the server's requests", async () => {
		const { client, sockets } = createClientHarness();
		client.start();
		sockets[0]?.open();

		sockets[0]?.receive(JSON.stringify(request(agentToolNames.list)));
		await Promise.resolve();
		await Promise.resolve();

		expect(JSON.parse(sockets[0]?.sent[0] ?? "{}")).toEqual({
			id: "r1",
			ok: true,
			result: "done",
		});
	});

	test("it reconnects with growing pauses after the connection drops", () => {
		const { client, timers, sockets } = createClientHarness();
		client.start();
		sockets[0]?.open();

		sockets[0]?.serverClose(1006);
		timers.advance(BRIDGE_RECONNECT_BASE_MS);
		sockets[1]?.serverClose(1006);
		timers.advance(BRIDGE_RECONNECT_BASE_MS);
		const afterShortWait = sockets.length;
		timers.advance(BRIDGE_RECONNECT_BASE_MS);

		expect(afterShortWait).toBe(2);
		expect(sockets).toHaveLength(3);
	});

	test("it stays away once another page took the token over", () => {
		const { client, timers, sockets, statuses } = createClientHarness();
		client.start();
		sockets[0]?.open();

		sockets[0]?.serverClose(BRIDGE_CLOSE_REPLACED);
		timers.advance(60_000);

		expect(sockets).toHaveLength(1);
		expect(statuses.at(-1)).toBe("replaced");
	});

	test("a silent server is treated as a dead connection", () => {
		const { client, timers, sockets } = createClientHarness();
		client.start();
		sockets[0]?.open();

		timers.advance(BRIDGE_HEARTBEAT_MS + BRIDGE_PONG_TIMEOUT_MS);

		expect(sockets[0]?.sent).toContain("ping");
		expect(sockets[0]?.closedWith).not.toBeNull();
	});
});

describe("the Expose to agents switch and the token", () => {
	function createConnectionHarness(saved: AgentSettings) {
		const clients: Array<{ url: string; stopped: Array<number | undefined> }> =
			[];
		const states: AgentConnectionState[] = [];
		let stored = saved;
		const connection = createAgentConnection({
			load: async () => stored,
			save: async (settings) => {
				stored = settings;
			},
			createClient: ({ url }) => {
				const record = { url, stopped: [] as Array<number | undefined> };
				clients.push(record);
				const client: BridgeClient = {
					start() {},
					stop: (code) => void record.stopped.push(code),
				};
				return client;
			},
			onRequest: async (incoming): Promise<BridgeResponse> => ({
				id: incoming.id,
				ok: true,
				result: null,
			}),
			onChange: (state) => states.push(state),
		});
		return { connection, clients, states, getStored: () => stored };
	}

	test("generating a URL turns the connection on and shows the URL", async () => {
		const { connection, clients, states } = createConnectionHarness({
			token: null,
			enabled: false,
		});
		await connection.init();

		await connection.generate();

		const state = states.at(-1);
		expect(state?.enabled).toBe(true);
		expect(state?.mcpUrl).toBe(`http://localhost:3001/mcp/${state?.token}`);
		expect(clients[0]?.url).toBe(bridgeUrlForToken(state?.token ?? ""));
	});

	test("regenerating revokes the old URL and connects with the new one", async () => {
		const token = "a".repeat(48);
		const { connection, clients, getStored } = createConnectionHarness({
			token,
			enabled: true,
		});
		await connection.init();

		await connection.regenerate();

		expect(clients[0]?.stopped).toEqual([BRIDGE_CLOSE_REVOKED]);
		expect(getStored().token).not.toBe(token);
		expect(clients[1]?.url).toBe(bridgeUrlForToken(getStored().token ?? ""));
	});

	test("turning the switch off disconnects, and it stays off after a restart", async () => {
		const token = "b".repeat(48);
		const first = createConnectionHarness({ token, enabled: true });
		await first.connection.init();
		await first.connection.setEnabled(false);

		const restarted = createConnectionHarness(first.getStored());
		await restarted.connection.init();

		expect(first.clients[0]?.stopped).toHaveLength(1);
		expect(restarted.clients).toHaveLength(0);
	});
});

describe("what the user pastes into an agent", () => {
	const url = `http://localhost:3001/mcp/${"c".repeat(48)}`;

	test("every tab carries the secret URL and the custom one is valid JSON", () => {
		const claude = snippetFor("claude", url).code;
		const codex = snippetFor("codex", url).code;
		const custom = snippetFor("custom", url).code;

		expect(claude).toContain(url);
		expect(codex).toContain(url);
		expect(JSON.parse(custom)).toEqual({
			mcpServers: { pleiades: { type: "http", url } },
		});
	});
});
