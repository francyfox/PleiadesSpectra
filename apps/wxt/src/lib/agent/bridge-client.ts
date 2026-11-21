import {
	BRIDGE_CLOSE_REPLACED,
	BRIDGE_HEARTBEAT_MS,
	BRIDGE_PING,
	BRIDGE_PONG,
	BRIDGE_PONG_TIMEOUT_MS,
	BRIDGE_RECONNECT_BASE_MS,
	BRIDGE_RECONNECT_MAX_MS,
	type BridgeRequest,
	type BridgeResponse,
} from "@repo/protocol";

export type BridgeStatus =
	| "disconnected"
	| "connecting"
	| "connected"
	| "replaced";

/** The part of a WebSocket the client uses, so tests can bring their own. */
export interface SocketLike {
	onopen: (() => void) | null;
	onmessage: ((event: { data: unknown }) => void) | null;
	onclose: ((event: { code: number }) => void) | null;
	send(text: string): void;
	close(code?: number, reason?: string): void;
}

type Timers = Pick<
	typeof globalThis,
	"setTimeout" | "clearTimeout" | "setInterval" | "clearInterval"
>;

export interface BridgeClientDeps {
	url: string;
	createSocket(url: string): SocketLike;
	onRequest(request: BridgeRequest): Promise<BridgeResponse>;
	onStatus(status: BridgeStatus): void;
	timers?: Timers;
}

export interface BridgeClient {
	start(): void;
	/** Closes the socket for good; `code` tells the server why (e.g. a revoked token). */
	stop(code?: number): void;
}

function reconnectDelayMs(attempt: number): number {
	return Math.min(
		BRIDGE_RECONNECT_BASE_MS * 2 ** attempt,
		BRIDGE_RECONNECT_MAX_MS,
	);
}

function parseRequest(data: unknown): BridgeRequest | null {
	try {
		const value = JSON.parse(String(data)) as Partial<BridgeRequest>;
		const isRequest =
			typeof value?.id === "string" && typeof value.name === "string";
		return isRequest ? (value as BridgeRequest) : null;
	} catch {
		return null;
	}
}

/**
 * Keeps one socket to the server alive: reconnects with growing pauses, pings to notice a dead
 * connection (laptop sleep), and stays away once another page took the token over.
 */
export function createBridgeClient(deps: BridgeClientDeps): BridgeClient {
	const timers = deps.timers ?? globalThis;
	let socket: SocketLike | null = null;
	let isStopped = true;
	let attempt = 0;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let heartbeat: ReturnType<typeof setInterval> | null = null;
	let pongDeadline: ReturnType<typeof setTimeout> | null = null;

	function stopHeartbeat(): void {
		if (heartbeat) timers.clearInterval(heartbeat);
		if (pongDeadline) timers.clearTimeout(pongDeadline);
		heartbeat = null;
		pongDeadline = null;
	}

	function startHeartbeat(current: SocketLike): void {
		heartbeat = timers.setInterval(() => {
			current.send(BRIDGE_PING);
			pongDeadline ??= timers.setTimeout(
				() => current.close(),
				BRIDGE_PONG_TIMEOUT_MS,
			);
		}, BRIDGE_HEARTBEAT_MS);
	}

	async function answer(current: SocketLike, request: BridgeRequest) {
		const response = await deps.onRequest(request);
		if (socket === current) current.send(JSON.stringify(response));
	}

	function handleMessage(current: SocketLike, data: unknown): void {
		if (data === BRIDGE_PONG) {
			if (pongDeadline) timers.clearTimeout(pongDeadline);
			pongDeadline = null;
			return;
		}
		const request = parseRequest(data);
		if (request) void answer(current, request);
	}

	function handleClose(code: number): void {
		stopHeartbeat();
		socket = null;
		if (isStopped) return;
		if (code === BRIDGE_CLOSE_REPLACED) {
			isStopped = true;
			deps.onStatus("replaced");
			return;
		}
		deps.onStatus("connecting");
		reconnectTimer = timers.setTimeout(connect, reconnectDelayMs(attempt));
		attempt += 1;
	}

	function connect(): void {
		reconnectTimer = null;
		if (isStopped) return;
		deps.onStatus("connecting");
		const current = deps.createSocket(deps.url);
		socket = current;
		current.onopen = () => {
			attempt = 0;
			deps.onStatus("connected");
			startHeartbeat(current);
		};
		current.onmessage = (event) => handleMessage(current, event.data);
		current.onclose = (event) => {
			if (socket === current) handleClose(event.code);
		};
	}

	return {
		start() {
			if (!isStopped) return;
			isStopped = false;
			attempt = 0;
			connect();
		},
		stop(code) {
			isStopped = true;
			if (reconnectTimer) timers.clearTimeout(reconnectTimer);
			reconnectTimer = null;
			stopHeartbeat();
			const current = socket;
			socket = null;
			current?.close(code);
			deps.onStatus("disconnected");
		},
	};
}
