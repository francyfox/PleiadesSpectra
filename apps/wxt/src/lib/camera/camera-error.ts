import type { CameraFailureReason } from "./camera-events";

export interface CameraFailure {
	reason: CameraFailureReason;
	message: string;
}

/** The browser reports these when the camera exists but cannot be opened now, most often because another consumer has it. */
const BUSY_ERRORS = new Set([
	"NotReadableError",
	"AbortError",
	"TrackStartError",
]);
const MISSING_ERRORS = new Set(["NotFoundError", "DevicesNotFoundError"]);

/** Whether opening the camera again after a short wait may work: a stream that was just released is not free at once. */
export function isCameraBusyError(error: unknown): boolean {
	return error instanceof DOMException && BUSY_ERRORS.has(error.name);
}

/**
 * What to tell the user about a camera that did not open. The name of the browser's error stays in the text: "the
 * camera is not available" says nothing about whether to allow it, free it or plug it in.
 */
export function classifyCameraError(error: unknown): CameraFailure {
	const name = error instanceof DOMException ? error.name : "Error";
	const detail =
		error instanceof Error && error.message ? `: ${error.message}` : "";
	if (name === "NotAllowedError" || name === "SecurityError")
		return { reason: "permission", message: "Camera access was not granted" };
	if (BUSY_ERRORS.has(name))
		return {
			reason: "camera",
			message: `The camera is busy, another program or tab may be using it (${name}${detail})`,
		};
	if (MISSING_ERRORS.has(name))
		return { reason: "camera", message: `No camera was found (${name})` };
	return {
		reason: "camera",
		message: `The camera is not available (${name}${detail})`,
	};
}
