import type { HeadPose, Point } from "./types";

/** MediaPipe Face Mesh indices; SmartSpectra returns the same 478-point layout. */
export const FACE_MESH = {
	noseTip: 1,
	rightEyeOuter: 33,
	leftEyeOuter: 263,
} as const;

const MIN_LANDMARK_COUNT = 264;

function midpoint(a: Point, b: Point): Point {
	return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function rotate(point: Point, angleRadians: number): Point {
	const cos = Math.cos(angleRadians);
	const sin = Math.sin(angleRadians);
	return {
		x: point.x * cos - point.y * sin,
		y: point.x * sin + point.y * cos,
	};
}

/**
 * Yaw and pitch: the nose tip offset from the eye midpoint, in the frame of the eye line and divided by the eye distance.
 * Dividing makes it independent of distance to the camera, rotating makes it independent of head roll.
 */
export function headPoseOf(landmarks: Point[]): HeadPose | null {
	if (landmarks.length < MIN_LANDMARK_COUNT) return null;

	const nose = landmarks[FACE_MESH.noseTip];
	const rightEye = landmarks[FACE_MESH.rightEyeOuter];
	const leftEye = landmarks[FACE_MESH.leftEyeOuter];
	if (!nose || !rightEye || !leftEye) return null;

	const eyeVector = { x: leftEye.x - rightEye.x, y: leftEye.y - rightEye.y };
	const eyeDistance = Math.hypot(eyeVector.x, eyeVector.y);
	if (eyeDistance === 0) return null;

	const eyeMidpoint = midpoint(rightEye, leftEye);
	const rollRadians = Math.atan2(eyeVector.y, eyeVector.x);
	const noseOffset = rotate(
		{ x: nose.x - eyeMidpoint.x, y: nose.y - eyeMidpoint.y },
		-rollRadians,
	);

	return {
		yaw: noseOffset.x / eyeDistance,
		pitch: noseOffset.y / eyeDistance,
		roll: rollRadians,
	};
}
