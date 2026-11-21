import type { ServerMessage } from "@repo/protocol";
import { Elysia } from "elysia";
import { HIDDEN_FROM_DOCS } from "#modules/docs/docs.utils";
import {
	type Connection,
	type ConnectionDeps,
	createConnection,
	defaultConnectionDeps,
	handleIncoming,
	stopConnection,
} from "./connection";

const connections = new Map<string, Connection>();

/** The worker may still report after the client left; a closed socket must not throw. */
function sendSafely(
	ws: { send(data: string): unknown },
	message: ServerMessage,
): void {
	try {
		ws.send(JSON.stringify(message));
	} catch {}
}

/** `ws://localhost:3001/ws`; the wire format is described in `@repo/protocol`. */
export function createStreamRoutes(
	deps: ConnectionDeps = defaultConnectionDeps,
) {
	return new Elysia().ws("/ws", {
		open(ws) {
			connections.set(ws.id, createConnection());
		},
		async message(ws, raw) {
			const connection = connections.get(ws.id);
			if (!connection) return;
			await handleIncoming(
				connection,
				raw,
				(message) => sendSafely(ws, message),
				deps,
			);
		},
		async close(ws) {
			const connection = connections.get(ws.id);
			connections.delete(ws.id);
			if (connection) await stopConnection(connection);
		},
		detail: HIDDEN_FROM_DOCS,
	});
}

export const streamRoutes = createStreamRoutes();
