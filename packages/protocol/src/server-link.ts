import type { Gesture } from "./gestures";
import type { SignalName, SignalSample } from "./signals";

/**
 * Extension ↔ server link: one WebSocket at `ws://localhost:3001/ws`.
 *
 * Extension → server:
 * - text: `ClientMessage` (JSON);
 * - binary: one video frame = `FRAME_HEADER_BYTES` header + RGBA pixels (`width * height * 4`).
 *   Header: u64 little-endian timestamp in microseconds (monotonic, increasing).
 *
 * Server → extension: text `ServerMessage` (JSON).
 */
export const SERVER_WS_URL = "ws://localhost:3001/ws";
export const FRAME_HEADER_BYTES = 8;
export const MIN_FRAME_RATE = 25;

export const expressionNames = [
	"ANGRY",
	"CONTEMPT",
	"DISGUST",
	"FEAR",
	"HAPPY",
	"NEUTRAL",
	"SAD",
	"SURPRISE",
] as const;

export type ExpressionName = (typeof expressionNames)[number];

/** SmartSpectra expression scores, 0–100 per expression. */
export type ExpressionScores = Partial<Record<ExpressionName, number>>;

export type ClientMessage =
	/** Opens a measurement session; frames follow in the given size. Server answers `ready` when it can measure. */
	| {
			type: "start";
			width: number;
			height: number;
			debug?: boolean;
			/**
			 * Signals the scripts on the page need. The server measures and sends only these (`pulse`
			 * adds the SDK's cardio metrics to the session). Gestures and `expression` are always sent.
			 */
			signals?: SignalName[];
	  }
	/**
	 * Turns the face mask on or off while a session runs: with it on, the server sends `mask` messages. It is for the
	 * extension's own preview, so a person can see what the SDK recognises; scripts never get it.
	 */
	| { type: "mask"; enabled: boolean }
	/** Closes the session (camera off). */
	| { type: "stop" };

export type ServerMessage =
	/** Session started and expressions are flowing: `ask` may begin counting its timeout. */
	| { type: "ready" }
	| { type: "expression"; scores: ExpressionScores }
	| { type: "gesture"; gesture: Gesture; confidence: number }
	/** One measurement of a signal that the client asked for in `start.signals`. */
	| { type: "signal"; sample: SignalSample }
	/**
	 * The face landmarks as the SDK found them, up to 15 times a second, only while the client asked with `mask`.
	 * `points` is flat, `[x0, y0, x1, y1, ...]`, in pixels of the frame that was sent (`width` × `height`).
	 */
	| { type: "mask"; width: number; height: number; points: number[] }
	/** Human-readable hint from SDK validation (`kNoFaceFound`, `kTooDark`, ...). */
	| { type: "validation"; code: number; hint: string }
	| { type: "error"; message: string; retryable: boolean }
	/** The decoded SmartSpectra payload as the SDK produced it, a few times a second. Only sent to a client that asked with `debug: true`. */
	| { type: "metrics"; metrics: unknown };
