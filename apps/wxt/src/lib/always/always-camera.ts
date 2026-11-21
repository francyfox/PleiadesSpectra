import type { CameraController } from "../camera/camera-controller";
import type { CameraEvent } from "../camera/camera-events";

export const ALWAYS_OWNER = "Always-on scripts";

export interface AlwaysCameraDeps {
	camera: CameraController;
	/** Whether the tab in front is a page of an enabled `@camera always` script and is not paused. */
	isHoldWanted(): Promise<boolean>;
	forwardGesture(gesture: string, confidence: number): void;
}

export interface AlwaysCamera {
	/** Makes the camera state match the answer of `isHoldWanted`. */
	sync(): Promise<void>;
	handleCameraEvent(event: CameraEvent): void;
}

export function createAlwaysCamera(deps: AlwaysCameraDeps): AlwaysCamera {
	let held = false;
	let queue: Promise<unknown> = Promise.resolve();

	const enqueue = (task: () => Promise<void>): Promise<void> => {
		const result = queue.then(task);
		queue = result.catch(() => {});
		return result;
	};

	const release = async () => {
		if (!held) return;
		held = false;
		await deps.camera.release(ALWAYS_OWNER);
	};

	return {
		sync: () =>
			enqueue(async () => {
				const wanted = await deps.isHoldWanted();
				if (wanted && !held) {
					held = true;
					await deps.camera.acquire(ALWAYS_OWNER).catch(() => {
						held = false;
					});
				} else if (!wanted) await release();
			}),
		handleCameraEvent(event) {
			if (event.kind === "failed" || event.kind === "lost") held = false;
			if (event.kind === "server" && event.message.type === "gesture" && held)
				deps.forwardGesture(event.message.gesture, event.message.confidence);
		},
	};
}
