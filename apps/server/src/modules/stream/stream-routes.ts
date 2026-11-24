import type { ServerMessage } from "@repo/protocol";
import { Elysia } from "elysia";
import { HIDDEN_FROM_DOCS } from "#modules/docs/docs.utils";
import { parseClientMessage } from "./client-message";
import {
	type Connection,
	type ConnectionDeps,
	createConnection,
	defaultConnectionDeps,
	handleIncoming,
	stopConnection,
} from "./connection";
import {
	createStreamLog,
	type PrintLine,
	printToConsole,
	type StreamLog,
} from "./stream-log";

interface ClientState {
	connection: Connection;
	log: StreamLog;
}

const clients = new Map<string, ClientState>();

/** Text from the client is a message; binary is a frame and is not worth parsing here. */
function logStart(log: StreamLog, raw: unknown): void {
	if (raw instanceof Uint8Array) return;
	const message = parseClientMessage(raw);
	if (message?.type === "start") log.started(message);
}

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
	print: PrintLine = printToConsole,
) {
	return new Elysia().ws("/ws", {
		open(ws) {
			clients.set(ws.id, {
				connection: createConnection(),
				log: createStreamLog(print),
			});
		},
		async message(ws, raw) {
			const client = clients.get(ws.id);
			if (!client) return;
			logStart(client.log, raw);
			await handleIncoming(
				client.connection,
				raw,
				(message) => {
					client.log.sent(message);
					sendSafely(ws, message);
				},
				deps,
			);
		},
		async close(ws) {
			const client = clients.get(ws.id);
			clients.delete(ws.id);
			if (!client) return;
			await stopConnection(client.connection);
			client.log.stopped();
		},
		detail: HIDDEN_FROM_DOCS,
	});
}

export const streamRoutes = createStreamRoutes();
