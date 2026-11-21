import { openWhenFree } from "../camera/camera-retry";
import { CAPTURE_CONSTRAINTS } from "../camera/camera-stream";

/**
 * The popup shows its own stream of the same camera, mirrored like a mirror. The pipeline to the server
 * runs elsewhere; a preview that cannot start (no permission yet) must not stop the check, and `onFailure` hears why.
 */
export async function startPreview(
	video: HTMLVideoElement,
	onFailure: (error: unknown) => void = () => {},
): Promise<MediaStream | null> {
	try {
		const stream = await openWhenFree(() =>
			navigator.mediaDevices.getUserMedia(CAPTURE_CONSTRAINTS),
		);
		video.playsInline = true;
		video.srcObject = stream;
		await video.play().catch(() => {});
		return stream;
	} catch (error) {
		onFailure(error);
		return null;
	}
}

export function stopPreview(
	video: HTMLVideoElement | undefined,
	stream: MediaStream | null,
): void {
	for (const track of stream?.getTracks() ?? []) track.stop();
	if (video) video.srcObject = null;
}
