import type { HeadPose } from "./types";

export const REST_POSE_SAMPLES = 30;

export interface RestPoseState {
	samples: HeadPose[];
	restPose: HeadPose | null;
}

export function createRestPoseState(): RestPoseState {
	return { samples: [], restPose: null };
}

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted[middle] ?? 0;
}

function medianPose(poses: HeadPose[]): HeadPose {
	return {
		yaw: median(poses.map((pose) => pose.yaw)),
		pitch: median(poses.map((pose) => pose.pitch)),
		roll: median(poses.map((pose) => pose.roll)),
	};
}

/** Collects the first poses of a session; the median of them is the neutral pose. */
export function addRestPoseSample(
	state: RestPoseState,
	pose: HeadPose,
): RestPoseState {
	if (state.restPose) return state;

	const samples = [...state.samples, pose];
	if (samples.length < REST_POSE_SAMPLES) return { samples, restPose: null };
	return { samples, restPose: medianPose(samples) };
}

export function poseRelativeTo(pose: HeadPose, restPose: HeadPose): HeadPose {
	return {
		yaw: pose.yaw - restPose.yaw,
		pitch: pose.pitch - restPose.pitch,
		roll: pose.roll - restPose.roll,
	};
}
