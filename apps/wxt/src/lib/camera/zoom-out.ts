/**
 * The SDK measures the pulse only when the face is not too big in the frame (it asks for "more of the chest in view"
 * from a person who sits close to the camera). Pixels of the chest are not needed: the same picture shrunk into the
 * middle of the frame, with black margins, passes, so the camera page shrinks the frame until the SDK is content.
 */

/** Fractions of the frame that the picture is drawn with, from the whole frame to the smallest one. */
export const ZOOM_STEPS = [1, 0.8, 0.65, 0.5, 0.4] as const;
/** The step the pulse starts with: most people sit close, and the SDK needs a moment to judge each step. */
export const PULSE_START_STEP = 1;
/** How long the advice of the SDK must stand before the picture is shrunk or grown by one more step. */
export const STEP_WAIT_MS = 2500;
/** The SDK repeats its advice only when it changes, and flips between codes in a blink, so a code is remembered a while. */
const REMEMBER_MS = 1000;

/** `ValidationCode` values of the SDK. */
const CHEST_NOT_VISIBLE = 7;
const FACE_TOO_CLOSE = 13;
const FACE_TOO_FAR = 14;

const SHRINK_CODES: readonly number[] = [CHEST_NOT_VISIBLE, FACE_TOO_CLOSE];

export interface ZoomOut {
	/** The newest advice of the SDK (`validation` message code). */
	onValidation(code: number, nowMs: number): void;
	/** The fraction to draw the next frame with; it moves one step at a time while the advice stands. */
	scaleAt(nowMs: number): number;
}

interface ZoomState {
	step: number;
	lastCode: number;
	lastShrinkCodeAtMs: number;
	lastStepAtMs: number | null;
}

/** Keeps the whole frame: for sessions that do not measure the pulse. */
export const noZoomOut: ZoomOut = {
	onValidation() {},
	scaleAt: () => 1,
};

export function createZoomOut(startStep: number = PULSE_START_STEP): ZoomOut {
	const state: ZoomState = {
		step: startStep,
		lastCode: 0,
		lastShrinkCodeAtMs: Number.NEGATIVE_INFINITY,
		lastStepAtMs: null,
	};

	const wantsShrink = (nowMs: number) =>
		SHRINK_CODES.includes(state.lastCode) ||
		nowMs - state.lastShrinkCodeAtMs < REMEMBER_MS;
	const wantsGrow = (nowMs: number) =>
		state.lastCode === FACE_TOO_FAR && !wantsShrink(nowMs);

	return {
		onValidation(code, nowMs) {
			state.lastCode = code;
			if (SHRINK_CODES.includes(code)) state.lastShrinkCodeAtMs = nowMs;
		},
		scaleAt(nowMs) {
			state.lastStepAtMs ??= nowMs;
			if (nowMs - state.lastStepAtMs >= STEP_WAIT_MS) {
				const lastStep = ZOOM_STEPS.length - 1;
				if (wantsShrink(nowMs) && state.step < lastStep) {
					state.step += 1;
					state.lastStepAtMs = nowMs;
				} else if (wantsGrow(nowMs) && state.step > 0) {
					state.step -= 1;
					state.lastStepAtMs = nowMs;
				}
			}
			return ZOOM_STEPS[state.step] ?? 1;
		},
	};
}

/** Where the face landmarks of a shrunk frame lie in the whole frame: the margins and the shrinking are undone. */
export function restorePoints(
	points: readonly number[],
	frame: { width: number; height: number },
	scale: number,
): number[] {
	const centerX = frame.width / 2;
	const centerY = frame.height / 2;
	return points.map((value, index) => {
		const center = index % 2 === 0 ? centerX : centerY;
		return Math.round((value - center) / scale + center);
	});
}
