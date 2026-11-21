import { browser } from "wxt/browser";
import { encodeFrame } from "../server-link/frame";
import { openServerLink } from "../server-link/server-link";
import { classifyCameraError } from "./camera-error";
import {
	type CameraEvent,
	type CameraEventMessage,
	type CameraFailureReason,
	isCameraMaskCommand,
	isCameraStopCommand,
} from "./camera-events";
import { createQualityMonitor } from "./camera-quality";
import { openCameraStream } from "./camera-stream";
import { startFrameLoop } from "./frame-loop";
import { readRequestedSignals } from "./session-params";

interface CameraSession {
	setMask(enabled: boolean): void;
	stop(): void;
}

type SetupError = Error & { reason: CameraFailureReason };

function setupError(reason: CameraFailureReason, message: string): SetupError {
	return Object.assign(new Error(message), { reason });
}

function report(event: CameraEvent): void {
	const message: CameraEventMessage = { type: "camera/event", event };
	browser.runtime.sendMessage(message).catch(() => {});
}

function describeCameraError(error: unknown): SetupError {
	const { reason, message } = classifyCameraError(error);
	return setupError(reason, message);
}

function describeServerError(error: unknown): SetupError {
	const message =
		error instanceof Error ? error.message : "Server is not reachable";
	return setupError("server", message);
}

/** Camera → WebSocket pipeline; frames never leave this page except to the local server. */
async function startSession(): Promise<CameraSession> {
	const camera = await openCameraStream().catch((error) => {
		throw describeCameraError(error);
	});
	try {
		const link = await openServerLink({
			width: camera.width,
			height: camera.height,
			debug: new URLSearchParams(location.search).get("debug") === "1",
			signals: readRequestedSignals(location.search),
			mask: new URLSearchParams(location.search).get("mask") === "1",
			onMessage: (message) => report({ kind: "server", message }),
			onLost: () => report({ kind: "lost" }),
		});
		const quality = createQualityMonitor((hint) =>
			report({ kind: "quality", hint }),
		);
		const stopLoop = startFrameLoop(camera, (rgba, timestampUs) => {
			link.sendFrame(encodeFrame(timestampUs, rgba));
			quality.push(rgba, timestampUs / 1000);
		});
		return {
			setMask: link.setMask,
			stop() {
				stopLoop();
				link.close();
				camera.stop();
			},
		};
	} catch (error) {
		camera.stop();
		throw describeServerError(error);
	}
}

/**
 * Entry point of the camera page (the offscreen document in Chrome, a tab in Firefox).
 * Opening the page starts capture; closing it or `camera/stop` ends it.
 */
export function runCameraPage(): void {
	let session: CameraSession | null = null;
	let stopRequested = false;
	let maskWanted = new URLSearchParams(location.search).get("mask") === "1";

	startSession()
		.then((started) => {
			if (stopRequested) started.stop();
			else {
				session = started;
				started.setMask(maskWanted);
			}
		})
		.catch((error: SetupError) =>
			report({ kind: "failed", reason: error.reason, message: error.message }),
		);

	const stop = () => {
		stopRequested = true;
		session?.stop();
		session = null;
	};
	browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
		if (isCameraMaskCommand(message)) {
			maskWanted = message.enabled;
			session?.setMask(maskWanted);
			return;
		}
		if (!isCameraStopCommand(message)) return;
		stop();
		sendResponse(true);
	});
	window.addEventListener("pagehide", stop);
}
