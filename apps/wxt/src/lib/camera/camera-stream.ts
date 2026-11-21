import { openWhenFree } from "./camera-retry";

export const CAPTURE_WIDTH = 640;
export const CAPTURE_HEIGHT = 480;
export const CAPTURE_FRAME_RATE = 30;

export interface CameraStream {
	stream: MediaStream;
	width: number;
	height: number;
	/** Releases the camera: the hardware light goes off. */
	stop(): void;
}

/**
 * Everything that opens the camera asks for this and nothing else (the pipeline, the popup's preview, the permission
 * page): a camera that is open in one size is shared only with a request for the same size, and a request for another
 * one can be refused as busy.
 */
export const CAPTURE_CONSTRAINTS: MediaStreamConstraints = {
	video: {
		width: { ideal: CAPTURE_WIDTH },
		height: { ideal: CAPTURE_HEIGHT },
		frameRate: { ideal: CAPTURE_FRAME_RATE },
	},
	audio: false,
};

/** Opens the camera; the browser may hand out a size close to, not exactly, the requested one. */
export async function openCameraStream(): Promise<CameraStream> {
	const stream = await openWhenFree(() =>
		navigator.mediaDevices.getUserMedia(CAPTURE_CONSTRAINTS),
	);
	const settings = stream.getVideoTracks()[0]?.getSettings() ?? {};
	return {
		stream,
		width: settings.width ?? CAPTURE_WIDTH,
		height: settings.height ?? CAPTURE_HEIGHT,
		stop: () => {
			for (const track of stream.getTracks()) track.stop();
		},
	};
}
