import type { CameraStream } from "./camera-stream";

export type FrameHandler = (
	rgba: Uint8ClampedArray,
	timestampUs: number,
) => void;

interface TrackProcessor {
	readable: ReadableStream<VideoFrame>;
}

type TrackProcessorConstructor = new (init: {
	track: MediaStreamTrack;
}) => TrackProcessor;

const FALLBACK_INTERVAL_MS = 33;

function nowUs(): number {
	return Math.round(performance.now() * 1000);
}

function createPixelReader(width: number, height: number) {
	const canvas = new OffscreenCanvas(width, height);
	const context = canvas.getContext("2d", { willReadFrequently: true });
	if (!context) throw new Error("2D canvas is not available");
	return (source: CanvasImageSource): Uint8ClampedArray => {
		context.drawImage(source, 0, 0, width, height);
		return context.getImageData(0, 0, width, height).data;
	};
}

/** Chrome: frames straight from the track, works in a hidden offscreen document. */
function loopWithTrackProcessor(
	camera: CameraStream,
	Processor: TrackProcessorConstructor,
	onFrame: FrameHandler,
): () => void {
	const track = camera.stream.getVideoTracks()[0];
	if (!track) throw new Error("Camera has no video track");
	const readPixels = createPixelReader(camera.width, camera.height);
	const reader = new Processor({ track }).readable.getReader();
	let running = true;

	const pump = async () => {
		while (running) {
			const { done, value: frame } = await reader.read();
			if (done) return;
			try {
				onFrame(readPixels(frame), nowUs());
			} finally {
				frame.close();
			}
		}
	};
	void pump();

	return () => {
		running = false;
		void reader.cancel().catch(() => {});
	};
}

/** Firefox and others: a hidden video element sampled on every presented frame. */
function loopWithVideoElement(
	camera: CameraStream,
	onFrame: FrameHandler,
): () => void {
	const video = document.createElement("video");
	video.muted = true;
	video.playsInline = true;
	video.srcObject = camera.stream;
	void video.play();
	const readPixels = createPixelReader(camera.width, camera.height);
	let running = true;

	const sample = () => {
		if (!running) return;
		if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)
			onFrame(readPixels(video), nowUs());
		scheduleNext();
	};
	const scheduleNext = () => {
		if ("requestVideoFrameCallback" in video)
			video.requestVideoFrameCallback(sample);
		else setTimeout(sample, FALLBACK_INTERVAL_MS);
	};
	scheduleNext();

	return () => {
		running = false;
		video.srcObject = null;
	};
}

/** Starts delivering RGBA frames; returns the function that stops the loop. */
export function startFrameLoop(
	camera: CameraStream,
	onFrame: FrameHandler,
): () => void {
	const Processor = (
		globalThis as { MediaStreamTrackProcessor?: TrackProcessorConstructor }
	).MediaStreamTrackProcessor;
	return Processor
		? loopWithTrackProcessor(camera, Processor, onFrame)
		: loopWithVideoElement(camera, onFrame);
}
