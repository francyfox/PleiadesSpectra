import { describe, expect, test } from "bun:test";
import {
	createHintToaster,
	MIN_TOAST_GAP_MS,
	SAME_TOAST_GAP_MS,
} from "./hint-toast";

function setup() {
	const toasts: string[] = [];
	let nowMs = 100_000;
	const toast = createHintToaster(
		(text) => toasts.push(text),
		() => nowMs,
	);
	return {
		toast,
		toasts,
		advance: (ms: number) => {
			nowMs += ms;
		},
	};
}

describe("the advice of the SDK as a toast", () => {
	test("the advice is shown, and an empty one (everything is fine) is not", () => {
		const h = setup();
		h.toast(5, "Add light, or move to a brighter area.");
		h.advance(MIN_TOAST_GAP_MS);
		h.toast(0, "");

		expect(h.toasts).toEqual(["Add light, or move to a brighter area."]);
	});

	test("the advice about the chest and the place of the face is left to the shrinking of the frame", () => {
		const h = setup();
		for (const code of [7, 13, 15, 16]) {
			h.toast(code, "Move.");
			h.advance(MIN_TOAST_GAP_MS);
		}

		expect(h.toasts).toEqual([]);
	});

	test("advice that follows another in a blink is dropped, and shows again after a pause", () => {
		const h = setup();
		h.toast(1, "No face found.");
		h.advance(500);
		h.toast(12, "Hold still - motion may affect accuracy.");
		h.advance(MIN_TOAST_GAP_MS);
		h.toast(12, "Hold still - motion may affect accuracy.");

		expect(h.toasts).toEqual([
			"No face found.",
			"Hold still - motion may affect accuracy.",
		]);
	});

	test("the same advice is not repeated for a while", () => {
		const h = setup();
		h.toast(1, "No face found.");
		h.advance(MIN_TOAST_GAP_MS);
		h.toast(1, "No face found.");
		h.advance(SAME_TOAST_GAP_MS);
		h.toast(1, "No face found.");

		expect(h.toasts).toEqual(["No face found.", "No face found."]);
	});
});
