import type { Gesture } from "@repo/protocol";
import { browser } from "wxt/browser";

/** The pictures of Beta in other poses; each is on the canvas of `beta_plugin.webp`, see `art/normalize-poses.py`. */
export type PoseName = "down" | "top" | "rotate" | "blow" | "heart";

export const POSE_FILE = {
	down: "/beta/down.webp",
	top: "/beta/top.webp",
	rotate: "/beta/rotate.webp",
	blow: "/beta/blow.webp",
	heart: "/beta/heart.webp",
} as const satisfies Record<PoseName, string>;

/** A pose shows for a gesture. `smile` and `confused` are emotions, and stay on the drawn face. */
const POSE_BY_GESTURE: Partial<Record<Gesture, PoseName>> = {
	nod: "down",
	"tilt-down": "down",
	"tilt-up": "top",
	shake: "rotate",
	"roll-left": "rotate",
	"roll-right": "rotate",
};

/** The canvas of every picture of Beta, base and poses. */
export const PICTURE_SIZE = { width: 762, height: 855 } as const;

export const GESTURE_POSE_MS = 900;

/** Beta spins the pinwheel, or shows the heart, for this long after the last breathing or pulse sample. */
export const BREATHING_POSE_MS = 10_000;
export const PULSE_POSE_MS = 10_000;

const DEFAULT_BREATHS_PER_MINUTE = 12;
const SECONDS_PER_MINUTE = 60;
const SHORTEST_BREATH_SECONDS = 2;
const LONGEST_BREATH_SECONDS = 10;

const SHORTEST_BEAT_SECONDS = 60 / 220;
const LONGEST_BEAT_SECONDS = 60 / 30;
const DEFAULT_BEATS_PER_MINUTE = 70;

/** One beat of the heart, from the rate in beats per minute; kept between 30 and 220 a minute. */
export function beatSeconds(beatsPerMinute: number | undefined): number {
	const rate =
		beatsPerMinute && beatsPerMinute > 0
			? beatsPerMinute
			: DEFAULT_BEATS_PER_MINUTE;
	return Math.min(
		LONGEST_BEAT_SECONDS,
		Math.max(SHORTEST_BEAT_SECONDS, SECONDS_PER_MINUTE / rate),
	);
}

export function poseForGesture(gesture: string): PoseName | undefined {
	return POSE_BY_GESTURE[gesture as Gesture];
}

/** One breath, from the rate in breaths per minute; a missing or odd rate means a calm 12 a minute. */
export function breathSeconds(breathsPerMinute: number | undefined): number {
	const rate =
		breathsPerMinute && breathsPerMinute > 0
			? breathsPerMinute
			: DEFAULT_BREATHS_PER_MINUTE;
	return Math.min(
		LONGEST_BREATH_SECONDS,
		Math.max(SHORTEST_BREATH_SECONDS, SECONDS_PER_MINUTE / rate),
	);
}

/** Which way the head turns: `shake` turns it to one side, and to the other side the next time. */
export function nextShakeIsMirrored(wasMirrored: boolean): boolean {
	return !wasMirrored;
}

let arePosesPreloaded = false;

/** Loads the pictures once, when the first question opens, so a pose does not flash empty the first time it shows. */
export function preloadPoses(): void {
	if (arePosesPreloaded) return;
	arePosesPreloaded = true;
	for (const file of Object.values(POSE_FILE)) {
		new Image().src = browser.runtime.getURL(file);
	}
}
