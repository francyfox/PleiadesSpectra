/** The SDK needs 25+ fps; the camera is expected to give 30, a little less is only rounding. */
export const MIN_FRAME_RATE = 28;
/** Average brightness (0–255) of the picture below which the face is hard to find. */
export const MIN_BRIGHTNESS = 60;
export const QUALITY_WINDOW_MS = 2000;
const BRIGHTNESS_SAMPLE_EVERY_MS = 250;
const PIXELS_PER_SAMPLE = 16;

export const DARK_HINT = "Too dark: turn on a light or face a window";
export const LOW_FPS_HINT_PREFIX = "Camera is slow";

/** Brightness of the picture, from every 16th pixel: enough to tell a dark room, cheap per frame. */
export function measureBrightness(rgba: Uint8ClampedArray): number {
	const step = PIXELS_PER_SAMPLE * 4;
	let sum = 0;
	let count = 0;
	for (let offset = 0; offset + 2 < rgba.length; offset += step) {
		sum +=
			0.2126 * (rgba[offset] ?? 0) +
			0.7152 * (rgba[offset + 1] ?? 0) +
			0.0722 * (rgba[offset + 2] ?? 0);
		count += 1;
	}
	return count === 0 ? 0 : sum / count;
}

export function describeSlowCamera(frameRate: number): string {
	return `${LOW_FPS_HINT_PREFIX}: ${Math.round(frameRate)} fps, 30 needed`;
}

/** Darkness wins: a dim room is the usual reason a camera slows down, so one fix covers both. */
export function chooseHint(brightness: number, frameRate: number): string {
	if (brightness < MIN_BRIGHTNESS) return DARK_HINT;
	if (frameRate < MIN_FRAME_RATE) return describeSlowCamera(frameRate);
	return "";
}

export interface QualityMonitor {
	/** Counts the frame; `nowMs` is the time it arrived. */
	push(rgba: Uint8ClampedArray, nowMs: number): void;
}

/**
 * Watches the frames the camera delivers and reports advice (empty text = fine again) only when it changes.
 * The first window is skipped: the camera is still adjusting exposure and rate then.
 */
export function createQualityMonitor(
	onHint: (hint: string) => void,
): QualityMonitor {
	let windowStart: number | null = null;
	let isWarmingUp = true;
	let frames = 0;
	let brightnessSum = 0;
	let brightnessSamples = 0;
	let lastSampleAt = Number.NEGATIVE_INFINITY;
	let reportedHint = "";

	const evaluate = (elapsedMs: number) => {
		const frameRate = (frames * 1000) / elapsedMs;
		const brightness =
			brightnessSamples === 0 ? 255 : brightnessSum / brightnessSamples;
		const hint = chooseHint(brightness, frameRate);
		if (hint === reportedHint) return;
		reportedHint = hint;
		onHint(hint);
	};

	const startWindow = (nowMs: number) => {
		windowStart = nowMs;
		frames = 0;
		brightnessSum = 0;
		brightnessSamples = 0;
	};

	return {
		push(rgba, nowMs) {
			if (windowStart === null) startWindow(nowMs);
			frames += 1;
			if (nowMs - lastSampleAt >= BRIGHTNESS_SAMPLE_EVERY_MS) {
				lastSampleAt = nowMs;
				brightnessSum += measureBrightness(rgba);
				brightnessSamples += 1;
			}
			const elapsed = nowMs - (windowStart ?? nowMs);
			if (elapsed < QUALITY_WINDOW_MS) return;
			if (isWarmingUp) isWarmingUp = false;
			else evaluate(elapsed);
			startWindow(nowMs);
		},
	};
}
