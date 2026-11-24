import { describe, expect, test } from "bun:test";
import {
	createZoomOut,
	noZoomOut,
	PULSE_START_STEP,
	restorePoints,
	STEP_WAIT_MS,
	ZOOM_STEPS,
} from "./zoom-out";

const CHEST_NOT_VISIBLE = 7;
const FACE_TOO_FAR = 14;
const OK = 0;

describe("shrinking the frame for the SDK", () => {
	test("a session that does not measure the pulse keeps the whole frame", () => {
		noZoomOut.onValidation(CHEST_NOT_VISIBLE, 0);

		expect(noZoomOut.scaleAt(60_000)).toBe(1);
	});

	test("it starts at the pulse step and holds while the SDK has no complaint", () => {
		const zoom = createZoomOut();

		expect(zoom.scaleAt(0)).toBe(ZOOM_STEPS[PULSE_START_STEP]);
		expect(zoom.scaleAt(STEP_WAIT_MS * 4)).toBe(ZOOM_STEPS[PULSE_START_STEP]);
	});

	test("while the SDK asks for more chest it shrinks one step per wait, down to the smallest step", () => {
		const zoom = createZoomOut();
		zoom.scaleAt(0);
		zoom.onValidation(CHEST_NOT_VISIBLE, 100);

		const scales = [1, 2, 3, 4, 5, 6].map((count) =>
			zoom.scaleAt(count * STEP_WAIT_MS),
		);

		expect(scales).toEqual([0.65, 0.5, 0.4, 0.4, 0.4, 0.4]);
	});

	test("it does not jump two steps at once", () => {
		const zoom = createZoomOut();
		zoom.scaleAt(0);
		zoom.onValidation(CHEST_NOT_VISIBLE, 100);

		expect(zoom.scaleAt(STEP_WAIT_MS)).toBe(0.65);
		expect(zoom.scaleAt(STEP_WAIT_MS + 100)).toBe(0.65);
	});

	test("it stops shrinking when the SDK is content, even if the chest advice flickers a moment before", () => {
		const zoom = createZoomOut();
		zoom.scaleAt(0);
		zoom.onValidation(CHEST_NOT_VISIBLE, 1000);
		zoom.onValidation(OK, 1200);

		expect(zoom.scaleAt(1200 + 3000)).toBe(ZOOM_STEPS[PULSE_START_STEP]);
	});

	test("a flicker between the codes in a blink still counts as asking for more chest", () => {
		const zoom = createZoomOut();
		zoom.scaleAt(0);
		zoom.onValidation(CHEST_NOT_VISIBLE, STEP_WAIT_MS - 300);
		zoom.onValidation(OK, STEP_WAIT_MS - 100);

		expect(zoom.scaleAt(STEP_WAIT_MS)).toBe(0.65);
	});

	test("a face that is too far grows the picture back, one step per wait", () => {
		const zoom = createZoomOut(3);
		zoom.scaleAt(0);
		zoom.onValidation(FACE_TOO_FAR, 100);

		expect(zoom.scaleAt(STEP_WAIT_MS)).toBe(0.65);
		expect(zoom.scaleAt(STEP_WAIT_MS * 2)).toBe(0.8);
		expect(zoom.scaleAt(STEP_WAIT_MS * 3)).toBe(1);
		expect(zoom.scaleAt(STEP_WAIT_MS * 4)).toBe(1);
	});
});

describe("landmarks of a shrunk frame", () => {
	test("they go back to the places of the whole frame", () => {
		const frame = { width: 640, height: 480 };
		const shrunkCenter = [320, 240];
		const shrunkCorner = [320 + 100 * 0.5, 240 - 50 * 0.5];

		expect(restorePoints(shrunkCenter, frame, 0.5)).toEqual([320, 240]);
		expect(restorePoints(shrunkCorner, frame, 0.5)).toEqual([420, 190]);
	});
});
