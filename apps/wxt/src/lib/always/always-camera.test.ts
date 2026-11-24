import { describe, expect, test } from "bun:test";
import type { CameraController } from "../camera/camera-controller";
import { ALWAYS_OWNER, createAlwaysCamera } from "./always-camera";

function setup() {
	const calls: string[] = [];
	let wanted = false;
	const camera = {
		acquire: async (owner: string) => void calls.push(`acquire ${owner}`),
		release: async (owner: string) => void calls.push(`release ${owner}`),
	} as unknown as CameraController;
	const gestures: string[] = [];
	const hints: Array<[number, string]> = [];
	const always = createAlwaysCamera({
		camera,
		isHoldWanted: async () => wanted,
		forwardGesture: (gesture) => gestures.push(gesture),
		forwardHint: (code, hint) => hints.push([code, hint]),
	});
	return {
		always,
		calls,
		gestures,
		hints,
		want: (value: boolean) => {
			wanted = value;
		},
	};
}

const gestureEvent = {
	kind: "server",
	message: { type: "gesture", gesture: "nod", confidence: 0.9 },
} as const;

describe("the camera of always scripts", () => {
	test("it is acquired once while wanted and released when no longer wanted", async () => {
		const h = setup();
		h.want(true);
		await h.always.sync();
		await h.always.sync();
		h.want(false);
		await h.always.sync();
		await h.always.sync();

		expect(h.calls).toEqual([
			`acquire ${ALWAYS_OWNER}`,
			`release ${ALWAYS_OWNER}`,
		]);
	});

	test("gestures are forwarded only while the camera is held", async () => {
		const h = setup();
		h.always.handleCameraEvent(gestureEvent);
		h.want(true);
		await h.always.sync();
		h.always.handleCameraEvent(gestureEvent);
		h.want(false);
		await h.always.sync();
		h.always.handleCameraEvent(gestureEvent);

		expect(h.gestures).toEqual(["nod"]);
	});

	test("the advice of the SDK is forwarded with its code while the camera is held", async () => {
		const chest = {
			kind: "server",
			message: {
				type: "validation",
				code: 7,
				hint: "Place more of the chest in view.",
			},
		} as const;
		const h = setup();
		h.always.handleCameraEvent(chest);
		h.want(true);
		await h.always.sync();
		h.always.handleCameraEvent(chest);

		expect(h.hints).toEqual([[7, "Place more of the chest in view."]]);
	});

	test("a camera that failed is asked for again on the next sync", async () => {
		const h = setup();
		h.want(true);
		await h.always.sync();
		h.always.handleCameraEvent({ kind: "lost" });
		await h.always.sync();

		expect(h.calls).toEqual([
			`acquire ${ALWAYS_OWNER}`,
			`acquire ${ALWAYS_OWNER}`,
		]);
	});
});
