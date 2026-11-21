/**
 * The heart that beats inside the heart of Beta's fingers (`heart.webp`). The origin of the
 * heart path is its centre, `HEART_CENTER` puts it in the gap between the fingers.
 */
export const HEART_PATH =
	"M0 32 C-14 20, -46 0, -46 -18 C-46 -32, -34 -40, -22 -40 C-10 -40, -2 -32, 0 -24 C2 -32, 10 -40, 22 -40 C34 -40, 46 -32, 46 -18 C46 0, 14 20, 0 32 Z";

export const HEART_CENTER = { x: 388, y: 756 };

/**
 * One beat is a strong push and a weaker one right after it, like a heart: scale values and when they are reached
 * as a share of the beat.
 */
export const HEART_BEAT_SCALES = "1;1.3;1;1.15;1";
export const HEART_BEAT_TIMES = "0;0.12;0.26;0.4;1";

export const HEART_COLORS = { fill: "#ef476f", outline: "#8f2f36" };
