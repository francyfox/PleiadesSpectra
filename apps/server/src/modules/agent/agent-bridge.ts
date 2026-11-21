import { timingSafeEqual } from "node:crypto";
import {
	AGENT_TOKEN_PATTERN,
	BRIDGE_CLOSE_REPLACED,
	BRIDGE_CLOSE_REVOKED,
	BRIDGE_PING,
	BRIDGE_PONG,
	type BridgeResponse,
	type BridgeToolName,
	NOT_EXPOSED_MESSAGE,
} from "@repo/protocol";

/** What the bridge needs from a WebSocket; the Elysia socket is adapted to it. */
export interface BridgeSocket {
	send(text: string): void;
	close(code: number, reason?: string): void;
}

interface PendingCall {
	socket: BridgeSocket;
	timer: ReturnType<typeof setTimeout>;
	resolve(response: BridgeResponse): void;
}

export interface AgentBridge {
	/** Connecting a page = “Expose to agents” is on. A newer page for the same token replaces the older one. */
	attach(token: string, socket: BridgeSocket): void;
	/** A page went away; `code` tells a regenerated (revoked) token from a plain disconnect. */
	detach(socket: BridgeSocket, code?: number): void;
	receive(socket: BridgeSocket, text: string): void;
	/** True once a page has ever connected with this token and it was not revoked. */
	isKnown(token: string): boolean;
	isExposed(token: string): boolean;
	call(
		token: string,
		name: BridgeToolName,
		input: Record<string, unknown>,
		timeoutMs: number,
	): Promise<BridgeResponse>;
}

const REPLACED_MESSAGE =
	"The Scripts page was replaced by another one. Ask the user to check the extension, then retry.";
const DISCONNECTED_MESSAGE =
	"The Scripts page disconnected during the call. Ask the user to check the extension, then retry.";

function failure(id: string, error: string): BridgeResponse {
	return { id, ok: false, error };
}

function sameToken(a: string, b: string): boolean {
	return (
		a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
	);
}

function readResponse(text: string): BridgeResponse | null {
	try {
		const value = JSON.parse(text) as Partial<BridgeResponse>;
		if (typeof value?.id !== "string" || typeof value.ok !== "boolean")
			return null;
		return value as BridgeResponse;
	} catch {
		return null;
	}
}

/**
 * In-memory relay between MCP calls and the extension page that owns the live state.
 * Tokens are compared in constant time; calls run one at a time like on the page itself.
 */
export function createAgentBridge(): AgentBridge {
	const sockets = new Map<string, BridgeSocket>();
	const knownTokens = new Set<string>();
	const pending = new Map<string, PendingCall>();
	let queue: Promise<unknown> = Promise.resolve();

	function findKey(token: string): string | undefined {
		if (!AGENT_TOKEN_PATTERN.test(token)) return undefined;
		return [...sockets.keys(), ...knownTokens].find((known) =>
			sameToken(known, token),
		);
	}

	function failPendingFor(socket: BridgeSocket, error: string): void {
		for (const [id, call] of pending) {
			if (call.socket !== socket) continue;
			pending.delete(id);
			clearTimeout(call.timer);
			call.resolve(failure(id, error));
		}
	}

	function dispatch(
		socket: BridgeSocket,
		name: BridgeToolName,
		input: Record<string, unknown>,
		timeoutMs: number,
	): Promise<BridgeResponse> {
		const id = crypto.randomUUID();
		return new Promise<BridgeResponse>((resolve) => {
			const timer = setTimeout(() => {
				pending.delete(id);
				resolve(
					failure(id, `The extension did not answer within ${timeoutMs} ms.`),
				);
			}, timeoutMs);
			pending.set(id, { socket, timer, resolve });
			try {
				socket.send(JSON.stringify({ id, name, input }));
			} catch {
				pending.delete(id);
				clearTimeout(timer);
				resolve(failure(id, "Could not reach the extension."));
			}
		});
	}

	return {
		attach(token, socket) {
			const key = findKey(token) ?? token;
			const existing = sockets.get(key);
			if (existing && existing !== socket) {
				failPendingFor(existing, REPLACED_MESSAGE);
				existing.close(BRIDGE_CLOSE_REPLACED, "Replaced by a newer page");
			}
			sockets.set(key, socket);
			knownTokens.add(key);
		},
		detach(socket, code) {
			failPendingFor(socket, DISCONNECTED_MESSAGE);
			for (const [token, current] of sockets) {
				if (current !== socket) continue;
				sockets.delete(token);
				if (code === BRIDGE_CLOSE_REVOKED) knownTokens.delete(token);
			}
		},
		receive(socket, text) {
			if (text === BRIDGE_PING) {
				socket.send(BRIDGE_PONG);
				return;
			}
			const response = readResponse(text);
			if (!response) return;
			const call = pending.get(response.id);
			if (!call || call.socket !== socket) return;
			pending.delete(response.id);
			clearTimeout(call.timer);
			call.resolve(response);
		},
		isKnown: (token) => findKey(token) !== undefined,
		isExposed(token) {
			const key = findKey(token);
			return key !== undefined && sockets.has(key);
		},
		call(token, name, input, timeoutMs) {
			const run = async (): Promise<BridgeResponse> => {
				const key = findKey(token);
				const socket = key ? sockets.get(key) : undefined;
				if (!socket) return failure("", NOT_EXPOSED_MESSAGE);
				return dispatch(socket, name, input, timeoutMs);
			};
			const result = queue.then(run);
			queue = result.catch(() => undefined);
			return result;
		},
	};
}
