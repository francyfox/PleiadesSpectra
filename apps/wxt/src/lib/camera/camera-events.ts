import type { ServerMessage } from "@repo/protocol";

export type CameraFailureReason = "permission" | "camera" | "server";

/** What the camera page reports to the background. */
export type CameraEvent =
	| { kind: "server"; message: ServerMessage }
	| { kind: "failed"; reason: CameraFailureReason; message: string }
	/** The server connection dropped while the camera was running. */
	| { kind: "lost" }
	/** Advice from the picture itself (too dark, too few frames); an empty hint means it is fine again. */
	| { kind: "quality"; hint: string };

export interface CameraEventMessage {
	type: "camera/event";
	event: CameraEvent;
}

/** Background → camera page: stop frames, tell the server and release the camera. */
export interface CameraStopCommand {
	type: "camera/stop";
}

/** Background → camera page: the popup wants the face mask, or does not any more. */
export interface CameraMaskCommand {
	type: "camera/mask";
	enabled: boolean;
}

export function isCameraMaskCommand(
	value: unknown,
): value is CameraMaskCommand {
	return (
		hasType(value, "camera/mask") &&
		typeof (value as { enabled?: unknown }).enabled === "boolean"
	);
}

function hasType(value: unknown, type: string): boolean {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as { type?: unknown }).type === type
	);
}

export function isCameraEventMessage(
	value: unknown,
): value is CameraEventMessage {
	return hasType(value, "camera/event");
}

export function isCameraStopCommand(
	value: unknown,
): value is CameraStopCommand {
	return hasType(value, "camera/stop");
}
