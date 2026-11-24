import type { ExpressionScores } from "./server-link";

/**
 * Signals are what SmartSpectra measures on the face, passed to scripts as they are, so a script can set its own
 * conditions (how many blinks, which way the head moved, how fast the pulse is) instead of waiting for a ready gesture.
 */
export const signalNames = ["blink", "pose", "expression", "pulse"] as const;

export type SignalName = (typeof signalNames)[number];

export function isSignalName(value: unknown): value is SignalName {
	return (signalNames as readonly unknown[]).includes(value);
}

/** The value of each signal. */
export interface SignalValues {
	/**
	 * Whether SmartSpectra sees a blink right now (`face.blinking`). Sent when the value changes, so a rising edge
	 * (`false` → `true`) is one blink. Not verified against real blinks yet: Glimra's live test got none.
	 */
	blink: { detected: boolean };
	/**
	 * Head orientation relative to the rest pose, in eye distances, from the face landmarks: `yaw` grows to the right
	 * of the image, `pitch` grows downward. Sent up to 15 times a second.
	 */
	pose: { yaw: number; pitch: number };
	/** Expression scores, 0–100 per expression. */
	expression: ExpressionScores;
	/**
	 * Heart rate in beats per minute (`cardio.pulse.rate`). `confidence` is 0–100; `stable` is the SDK's verdict.
	 * Not a medical reading.
	 */
	pulse: { bpm: number; confidence: number; stable: boolean };
}

/** One measurement of a signal. */
export interface SignalSample<Name extends SignalName = SignalName> {
	signal: Name;
	value: SignalValues[Name];
	/** Milliseconds since the Unix epoch; for SDK measurements it is the SDK's own timestamp. */
	at: number;
}

/** `CustomEvent` on `window` that carries a `SignalSample` as its `detail` (like `GESTURE_EVENT_NAME`). */
export const SIGNAL_EVENT_NAME = "pleiades:signal";
