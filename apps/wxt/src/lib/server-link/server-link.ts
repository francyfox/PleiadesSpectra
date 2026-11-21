import {
	type ClientMessage,
	SERVER_WS_URL,
	type ServerMessage,
	type SignalName,
} from "@repo/protocol";
import { parseServerMessage } from "./parse-server-message";

const CONNECT_TIMEOUT_MS = 3000;

/** A frame is dropped when the socket still holds more than this many bytes: never build a queue. */
const MAX_BUFFERED_BYTES = 3 * 1024 * 1024;

export interface ServerLink {
	/** Returns false when the frame was dropped (socket closed or lagging). */
	sendFrame(frame: ArrayBuffer): boolean;
	/** Asks the server to send the face mask (`mask` messages), or to stop. */
	setMask(enabled: boolean): void;
	/** Tells the server the session is over and closes the socket. */
	close(): void;
}

export interface OpenServerLinkOptions {
	width: number;
	height: number;
	/** Asks the server to also send the raw SDK payload (`metrics`). */
	debug?: boolean;
	/** Signals the scripts need; left out of `start` when empty. */
	signals?: SignalName[];
	/** Whether the mask is wanted from the first frame on. */
	mask?: boolean;
	onMessage: (message: ServerMessage) => void;
	/** Called once when the socket closes without `close()` being called. */
	onLost: () => void;
	url?: string;
	createSocket?: (url: string) => WebSocket;
}

function sendJson(socket: WebSocket, message: ClientMessage): void {
	socket.send(JSON.stringify(message));
}

function waitForOpen(socket: WebSocket): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error("Server connection timed out")),
			CONNECT_TIMEOUT_MS,
		);
		socket.addEventListener("open", () => {
			clearTimeout(timer);
			resolve();
		});
		socket.addEventListener("error", () => {
			clearTimeout(timer);
			reject(new Error("Server is not reachable"));
		});
	});
}

function createLink(socket: WebSocket): ServerLink {
	return {
		sendFrame(frame) {
			if (socket.readyState !== WebSocket.OPEN) return false;
			if (socket.bufferedAmount > MAX_BUFFERED_BYTES) return false;
			socket.send(frame);
			return true;
		},
		setMask(enabled) {
			if (socket.readyState === WebSocket.OPEN)
				sendJson(socket, { type: "mask", enabled });
		},
		close() {
			if (socket.readyState === WebSocket.OPEN)
				sendJson(socket, { type: "stop" });
			socket.close();
		},
	};
}

/** Opens the socket and sends `start`; resolves when the server can receive frames (`ready` follows later). */
export async function openServerLink(
	options: OpenServerLinkOptions,
): Promise<ServerLink> {
	const socket = (options.createSocket ?? ((url) => new WebSocket(url)))(
		options.url ?? SERVER_WS_URL,
	);
	socket.binaryType = "arraybuffer";
	await waitForOpen(socket);

	const link = createLink(socket);
	let closedByUs = false;
	socket.addEventListener("message", (event) => {
		const message = parseServerMessage(event.data);
		if (message) options.onMessage(message);
	});
	socket.addEventListener("close", () => {
		if (!closedByUs) options.onLost();
	});

	sendJson(socket, {
		type: "start",
		width: options.width,
		height: options.height,
		debug: options.debug,
		signals: options.signals?.length ? options.signals : undefined,
	});
	if (options.mask) link.setMask(true);
	return {
		sendFrame: link.sendFrame,
		setMask: link.setMask,
		close() {
			closedByUs = true;
			link.close();
		},
	};
}
