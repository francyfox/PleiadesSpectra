export const gestures = [
	"nod",
	"shake",
	"tilt-down",
	"tilt-up",
	"roll-left",
	"roll-right",
	"smile",
	"confused",
	"talking",
] as const;

/** A head movement or facial expression the camera recognises. */
export type Gesture = (typeof gestures)[number];

export function isGesture(value: unknown): value is Gesture {
	return (gestures as readonly unknown[]).includes(value);
}
