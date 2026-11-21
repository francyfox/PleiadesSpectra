import type { ClientMessage, ServerMessage } from "@repo/protocol";
import { config } from "#modules/config/config";
import { parseClientMessage } from "./client-message";
import { parseFrame } from "./frame";
import {
	createSdkWorker,
	openStreamSession,
	type StreamSession,
	type WorkerFactory,
} from "./stream-session";

/** Everything one WebSocket client has going: the session once it is up and the frame size it announced. */
export interface Connection {
	session: StreamSession | null;
	isStarting: boolean;
	/** Set by `stop` or a closed socket; a session that finishes starting afterwards must be stopped at once. */
	isStopRequested: boolean;
	/** The client wants `mask` messages. It may say so while the session is still starting, so it is kept here. */
	isMaskWanted: boolean;
	width: number;
	height: number;
}

export function createConnection(): Connection {
	return {
		session: null,
		isStarting: false,
		isStopRequested: false,
		isMaskWanted: false,
		width: 0,
		height: 0,
	};
}

type Send = (message: ServerMessage) => void;

/** What a connection needs from outside; the default is the real SDK worker. */
export interface ConnectionDeps {
	createWorker: WorkerFactory;
}

export const defaultConnectionDeps: ConnectionDeps = {
	createWorker: createSdkWorker,
};

function isBinary(raw: unknown): raw is Uint8Array {
	return raw instanceof Uint8Array;
}

async function handleStart(
	connection: Connection,
	message: Extract<ClientMessage, { type: "start" }>,
	send: Send,
	deps: ConnectionDeps,
): Promise<void> {
	if (connection.session || connection.isStarting) return;
	if (!config.SMARTSPECTRA_API_KEY) {
		send({
			type: "error",
			message: "SMARTSPECTRA_API_KEY is not set on the server",
			retryable: false,
		});
		return;
	}

	connection.isStarting = true;
	connection.isStopRequested = false;
	connection.width = message.width;
	connection.height = message.height;
	const result = await openStreamSession(
		{
			width: message.width,
			height: message.height,
			debug: message.debug,
			signals: message.signals,
			onMessage: send,
		},
		deps.createWorker,
	);
	connection.isStarting = false;

	if (!result.ok) {
		send({
			type: "error",
			message: result.message,
			retryable: result.retryable,
		});
		return;
	}
	if (connection.isStopRequested) {
		await result.session.stop();
		return;
	}
	connection.session = result.session;
	if (connection.isMaskWanted) result.session.setMask(true);
}

export async function stopConnection(connection: Connection): Promise<void> {
	const session = connection.session;
	connection.isStopRequested = true;
	connection.isMaskWanted = false;
	connection.session = null;
	await session?.stop();
}

function handleFrame(connection: Connection, bytes: Uint8Array): void {
	if (!connection.session) return;
	const frame = parseFrame(bytes, connection.width, connection.height);
	if (frame) connection.session.sendFrame(frame);
}

/** Text is a `ClientMessage`, binary is a video frame; anything else is ignored. */
export async function handleIncoming(
	connection: Connection,
	raw: unknown,
	send: Send,
	deps: ConnectionDeps = defaultConnectionDeps,
): Promise<void> {
	if (isBinary(raw)) {
		handleFrame(connection, raw);
		return;
	}

	const message = parseClientMessage(raw);
	if (!message) {
		send({ type: "error", message: "Malformed message", retryable: false });
		return;
	}
	if (message.type === "start")
		await handleStart(connection, message, send, deps);
	else if (message.type === "mask") {
		connection.isMaskWanted = message.enabled;
		connection.session?.setMask(message.enabled);
	} else await stopConnection(connection);
}
