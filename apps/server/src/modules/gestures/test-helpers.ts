import { FACE_MESH } from "./head-pose";
import type { Point } from "./types";

const LANDMARK_COUNT = 478;
const EYE_DISTANCE = 100;

/** A face where only the three points the pose needs are meaningful. */
export function syntheticLandmarks(
	pose: { yaw: number; pitch: number },
	rollRadians = 0,
): Point[] {
	const points: Point[] = Array.from({ length: LANDMARK_COUNT }, () => ({
		x: 0,
		y: 0,
	}));
	const center = { x: 320, y: 240 };
	const half = EYE_DISTANCE / 2;
	const cos = Math.cos(rollRadians);
	const sin = Math.sin(rollRadians);
	const place = (x: number, y: number): Point => ({
		x: center.x + x * cos - y * sin,
		y: center.y + x * sin + y * cos,
	});

	points[FACE_MESH.rightEyeOuter] = place(-half, 0);
	points[FACE_MESH.leftEyeOuter] = place(half, 0);
	points[FACE_MESH.noseTip] = place(
		pose.yaw * EYE_DISTANCE,
		pose.pitch * EYE_DISTANCE,
	);
	return points;
}

export const FRAME_MS = 33;
