/** The SDK needs at least this many frames per second, below it the session fails with `kFrameRateTooLow`. */
export const SDK_MIN_FPS = 25;

const WINDOW_MS = 1000;

type FrameCallbackVideo = HTMLVideoElement & {
	requestVideoFrameCallback(callback: () => void): number;
	cancelVideoFrameCallback(handle: number): void;
};

/** How many frames fit into the window, scaled to one second. */
export function framesPerSecond(frames: number, elapsedMs: number): number {
	return elapsedMs > 0 ? Math.round((frames * 1000) / elapsedMs) : 0;
}

/**
 * Counts the frames that the video really shows and reports the rate once a second.
 * It measures the delivered picture, not the rate that was asked of the camera.
 * @returns a function that stops the counting
 */
export function startFpsMeter(
	video: HTMLVideoElement,
	onRate: (fps: number) => void,
): () => void {
	const source = video as FrameCallbackVideo;
	if (typeof source.requestVideoFrameCallback !== "function") return () => {};

	let frames = 0;
	let windowStartedAt = performance.now();
	let handle = 0;
	let running = true;

	const onFrame = () => {
		if (!running) return;
		frames++;
		const elapsed = performance.now() - windowStartedAt;
		if (elapsed >= WINDOW_MS) {
			onRate(framesPerSecond(frames, elapsed));
			frames = 0;
			windowStartedAt = performance.now();
		}
		handle = source.requestVideoFrameCallback(onFrame);
	};
	handle = source.requestVideoFrameCallback(onFrame);

	return () => {
		running = false;
		source.cancelVideoFrameCallback(handle);
	};
}
