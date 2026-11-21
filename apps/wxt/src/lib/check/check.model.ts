import type { Emotion, EmotionTracker } from "../emotion";

export const CHECK_OWNER = "Spectra check";
/** A check never keeps the camera longer than this, even when the popup could not stop it. */
export const CHECK_MAX_MS = 30_000;

export type CheckStatus = "idle" | "starting" | "running" | "blocked";

/** The background's view of a check: the emotion is tracked here so the popup only draws. */
export interface CheckState {
	status: CheckStatus;
	tracker: EmotionTracker;
	/** Advice from the SDK while measuring, e.g. “Too dark”. */
	hint: string;
	/** Why the check is blocked. */
	reason: string;
}

/** What the popup receives. */
export interface CheckView {
	status: CheckStatus;
	/** What Beta shows; an idle or blocked check shows the neutral face. */
	emotion: Emotion;
	hint: string;
	reason: string;
}

export type LogLevel = "info" | "error";

export interface SpectraLogEntry {
	id: number;
	at: number;
	level: LogLevel;
	/** A short summary of the line. */
	text: string;
	/** The whole answer of the server (or the camera event), as it came. */
	payload?: unknown;
}
