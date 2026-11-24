/**
 * JSON Schema and examples of the WebSocket messages, mirroring `@repo/protocol` and `client-message.ts`.
 * Elysia does not render `ws` routes in OpenAPI, so the AsyncAPI document (`stream.asyncapi.ts`) reuses them.
 */
import {
	expressionNames,
	gestures,
	MIN_FRAME_RATE,
	signalNames,
} from "@repo/protocol";

/** Plain JSON Schema (OpenAPI 3.1): looser than the 3.0 types of the OpenAPI typings. */
export type JsonSchema = Record<string, unknown>;

const MAX_FRAME_SIDE = 1920;

export const startMessageSchema: JsonSchema = {
	type: "object",
	description:
		"Opens a measurement session. Frames in the announced size must follow as binary messages.",
	required: ["type", "width", "height"],
	properties: {
		type: { type: "string", const: "start", description: "Message kind." },
		width: {
			type: "integer",
			minimum: 1,
			maximum: MAX_FRAME_SIDE,
			description: "Width in pixels of every frame that will be sent.",
			examples: [640],
		},
		height: {
			type: "integer",
			minimum: 1,
			maximum: MAX_FRAME_SIDE,
			description: "Height in pixels of every frame that will be sent.",
			examples: [480],
		},
		debug: {
			type: "boolean",
			description:
				"Also receive `metrics` messages with the decoded SmartSpectra payload (at most every 200 ms). Off by default.",
			examples: [false],
		},
		signals: {
			type: "array",
			uniqueItems: true,
			items: { type: "string", enum: [...signalNames] },
			description:
				"Signals to measure and send as `signal` messages. Without it none are sent (gestures and `expression` messages always are). `pulse` also switches the SDK's cardio metrics on; they are off otherwise. An unknown name makes the whole message malformed.",
			examples: [["blink", "pose"]],
		},
	},
};

export const maskMessageSchema: JsonSchema = {
	type: "object",
	description:
		"Turns the face mask on or off while the session runs. With it on the server sends `mask` messages. It is for the extension's own preview: a script never receives it.",
	required: ["type", "enabled"],
	properties: {
		type: { type: "string", const: "mask", description: "Message kind." },
		enabled: {
			type: "boolean",
			description: "Whether `mask` messages are wanted.",
		},
	},
};

export const stopMessageSchema: JsonSchema = {
	type: "object",
	description:
		"Closes the measurement session (camera off). The server does not answer it.",
	required: ["type"],
	properties: {
		type: { type: "string", const: "stop", description: "Message kind." },
	},
};

export const clientMessageSchema: JsonSchema = {
	oneOf: [startMessageSchema, maskMessageSchema, stopMessageSchema],
	discriminator: { propertyName: "type" },
};

export const clientMessageExamples = {
	start: {
		summary: "Start at 640x480",
		value: { type: "start", width: 640, height: 480 },
	},
	startDebug: {
		summary: "Start with raw metrics",
		value: { type: "start", width: 640, height: 480, debug: true },
	},
	startSignals: {
		summary: "Start with signals",
		value: {
			type: "start",
			width: 640,
			height: 480,
			signals: ["blink", "pose", "pulse"],
		},
	},
	maskOn: {
		summary: "Mask on",
		value: { type: "mask", enabled: true },
	},
	stop: { summary: "Stop", value: { type: "stop" } },
};

export const frameSchema: JsonSchema = {
	type: "string",
	format: "binary",
	description: `Binary WebSocket message: 8-byte header + RGBA pixels. Total size must be exactly 8 + width * height * 4 bytes. Header: unsigned 64-bit little-endian timestamp in microseconds, monotonic and increasing. Send at least ${MIN_FRAME_RATE} frames per second.`,
};

export const serverMessageSchemas: Record<string, JsonSchema> = {
	ready: {
		type: "object",
		description:
			"First expression has arrived: the session is measuring. Sent once per session.",
		required: ["type"],
		properties: { type: { type: "string", const: "ready" } },
	},
	expression: {
		type: "object",
		description:
			"Facial expression scores, at most every 100 ms. A name may be missing when the SDK did not report it.",
		required: ["type", "scores"],
		properties: {
			type: { type: "string", const: "expression" },
			scores: {
				type: "object",
				description: "Confidence 0-100 per expression.",
				properties: Object.fromEntries(
					expressionNames.map((name) => [
						name,
						{ type: "number", minimum: 0, maximum: 100 },
					]),
				),
			},
		},
	},
	gesture: {
		type: "object",
		description: "A recognised gesture.",
		required: ["type", "gesture", "confidence"],
		properties: {
			type: { type: "string", const: "gesture" },
			gesture: { type: "string", enum: [...gestures] },
			confidence: {
				type: "number",
				minimum: 0,
				maximum: 1,
				description: "How far past its threshold the gesture was.",
			},
		},
	},
	signal: {
		type: "object",
		description:
			"One measurement of a signal requested in `start.signals`. `at` is milliseconds since the Unix epoch: the SDK's own timestamp for pulse (and blink when the SDK gives one), server time otherwise.",
		required: ["type", "sample"],
		properties: {
			type: { type: "string", const: "signal" },
			sample: {
				type: "object",
				required: ["signal", "value", "at"],
				properties: {
					signal: { type: "string", enum: [...signalNames] },
					value: {
						type: "object",
						description:
							"blink: { detected }. pose: { yaw, pitch }. expression: scores 0-100 per expression. pulse: { bpm, confidence, stable }.",
					},
					at: { type: "integer" },
				},
			},
		},
	},
	validation: {
		type: "object",
		description:
			"The SDK's verdict on the picture changed (not sent while it is OK, and not repeated while unchanged).",
		required: ["type", "code", "hint"],
		properties: {
			type: { type: "string", const: "validation" },
			code: {
				type: "integer",
				description:
					"SmartSpectra ValidationCode: 1 no face, 2 multiple faces, 3 face not centered, 5 too dark, 6 too bright, 11 frame rate too low, 12 excessive motion, 13 face too close, 14 face too far, and others.",
			},
			hint: {
				type: "string",
				description: "Human-readable text from the SDK.",
			},
		},
	},
	error: {
		type: "object",
		description: "Something failed. The socket stays open.",
		required: ["type", "message", "retryable"],
		properties: {
			type: { type: "string", const: "error" },
			message: { type: "string" },
			retryable: {
				type: "boolean",
				description: "Whether sending `start` again may succeed.",
			},
		},
	},
	mask: {
		type: "object",
		description:
			"The face landmarks as the SDK found them, up to 15 times a second. Only sent after a `mask` message with `enabled: true`.",
		required: ["type", "width", "height", "points"],
		properties: {
			type: { type: "string", const: "mask" },
			width: { type: "integer", description: "Width of the frame in pixels." },
			height: {
				type: "integer",
				description: "Height of the frame in pixels.",
			},
			points: {
				type: "array",
				items: { type: "integer" },
				description:
					"Flat list `[x0, y0, x1, y1, ...]` in pixels of the frame, 478 points in the MediaPipe Face Mesh layout.",
			},
		},
	},
	metrics: {
		type: "object",
		description:
			"Decoded SmartSpectra payload as the SDK produced it. Only sent when `start` had `debug: true`, at most every 200 ms.",
		required: ["type", "metrics"],
		properties: {
			type: { type: "string", const: "metrics" },
			metrics: { type: "object", description: "See SmartSpectra data-types." },
		},
	},
};

export const serverMessageSchema: JsonSchema = {
	oneOf: Object.values(serverMessageSchemas),
	discriminator: { propertyName: "type" },
};

export const serverMessageExamples = {
	ready: { summary: "Session is measuring", value: { type: "ready" } },
	expression: {
		summary: "Expression scores",
		value: {
			type: "expression",
			scores: {
				ANGRY: 1.2,
				CONTEMPT: 0.4,
				DISGUST: 0.3,
				FEAR: 0.5,
				HAPPY: 71.8,
				NEUTRAL: 22.1,
				SAD: 0.9,
				SURPRISE: 2.8,
			},
		},
	},
	gesture: {
		summary: "Smile",
		value: { type: "gesture", gesture: "smile", confidence: 0.64 },
	},
	signalBlink: {
		summary: "Blink signal (sent on change only)",
		value: {
			type: "signal",
			sample: { signal: "blink", value: { detected: true }, at: 1763800000123 },
		},
	},
	signalPose: {
		summary: "Pose signal, relative to the rest pose in eye distances",
		value: {
			type: "signal",
			sample: {
				signal: "pose",
				value: { yaw: 0.31, pitch: -0.05 },
				at: 1763800000140,
			},
		},
	},
	signalExpression: {
		summary: "Expression signal",
		value: {
			type: "signal",
			sample: {
				signal: "expression",
				value: { HAPPY: 71.8, NEUTRAL: 22.1, SAD: 0.9 },
				at: 1763800000200,
			},
		},
	},
	signalPulse: {
		summary: "Pulse signal (not a medical reading)",
		value: {
			type: "signal",
			sample: {
				signal: "pulse",
				value: { bpm: 72.5, confidence: 83, stable: true },
				at: 1763800000500,
			},
		},
	},
	validation: {
		summary: "No face in the picture",
		value: { type: "validation", code: 1, hint: "No face found" },
	},
	errorMalformed: {
		summary: "Invalid client message",
		value: { type: "error", message: "Malformed message", retryable: false },
	},
	errorNoKey: {
		summary: "API key missing on the server",
		value: {
			type: "error",
			message: "SMARTSPECTRA_API_KEY is not set on the server",
			retryable: false,
		},
	},
	errorBusy: {
		summary: "Another session is running",
		value: {
			type: "error",
			message: "A measurement session is already running",
			retryable: true,
		},
	},
	errorTimeout: {
		summary: "SDK start timeout",
		value: {
			type: "error",
			message: "SmartSpectra did not start in time",
			retryable: true,
		},
	},
	mask: {
		summary: "Three of the landmarks",
		value: {
			type: "mask",
			width: 640,
			height: 480,
			points: [271, 205, 349, 204, 310, 262],
		},
	},
	metrics: {
		summary: "Raw payload (debug)",
		value: {
			type: "metrics",
			metrics: { face: { talking: [{ detected: true }] } },
		},
	},
};
