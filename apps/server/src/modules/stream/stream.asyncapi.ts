import {
	capitalize,
	type JsonObject,
	messageOf,
	operationOf,
	ref,
	toMessageExamples,
	toPlainSchema,
} from "#modules/docs/asyncapi.utils";
import { STREAM_CHANNEL_DESCRIPTION } from "./stream.docs";
import {
	clientMessageExamples,
	frameSchema,
	maskMessageSchema,
	serverMessageExamples,
	serverMessageSchemas,
	startMessageSchema,
	stopMessageSchema,
} from "./stream.schemas";

const STREAM_TAG = "stream";
const CHANNEL = "stream";

interface MessageSpec {
	key: string;
	title: string;
	summary: string;
	contentType: string;
	schema: object;
	examples: JsonObject[];
}

const clientMessages: MessageSpec[] = [
	{
		key: "start",
		title: "Start",
		summary: "Opens a measurement session with the frame size.",
		contentType: "application/json",
		schema: startMessageSchema,
		examples: toMessageExamples(clientMessageExamples, [
			"start",
			"startDebug",
			"startSignals",
		]),
	},
	{
		key: "setMask",
		title: "Mask on or off",
		summary:
			"Starts or stops the `mask` messages (the face landmarks) of the running session. Not answered.",
		contentType: "application/json",
		schema: maskMessageSchema,
		examples: toMessageExamples(clientMessageExamples, ["maskOn"]),
	},
	{
		key: "stop",
		title: "Stop",
		summary: "Closes the session (camera off). Not answered.",
		contentType: "application/json",
		schema: stopMessageSchema,
		examples: toMessageExamples(clientMessageExamples, ["stop"]),
	},
	{
		key: "frame",
		title: "Video frame",
		summary: "Binary message: 8-byte timestamp header + RGBA pixels.",
		contentType: "application/octet-stream",
		schema: frameSchema,
		examples: [],
	},
];

const serverMessages: MessageSpec[] = [
	{
		key: "ready",
		title: "Ready",
		summary: "The first expression has arrived; the session is measuring.",
		examples: ["ready"],
	},
	{
		key: "expression",
		title: "Expression",
		summary: "Expression scores 0-100, at most every 100 ms.",
		examples: ["expression"],
	},
	{
		key: "gesture",
		title: "Gesture",
		summary: "A gesture recognised on the server.",
		examples: ["gesture"],
	},
	{
		key: "signal",
		title: "Signal",
		summary: "One measurement of a signal requested in `start.signals`.",
		examples: ["signalBlink", "signalPose", "signalExpression", "signalPulse"],
	},
	{
		key: "validation",
		title: "Validation",
		summary: "The SDK's verdict on the picture changed.",
		examples: ["validation"],
	},
	{
		key: "error",
		title: "Error",
		summary: "Something failed; the socket stays open.",
		examples: ["errorMalformed", "errorNoKey", "errorBusy", "errorTimeout"],
	},
	{
		key: "mask",
		title: "Face mask",
		summary: "The face landmarks; only after the client sent `mask`.",
		examples: ["mask"],
	},
	{
		key: "metrics",
		title: "Metrics (debug)",
		summary: "Decoded SDK payload; only when `start` had `debug: true`.",
		examples: ["metrics"],
	},
].map(({ key, title, summary, examples }) => ({
	key,
	title,
	summary,
	contentType: "application/json",
	schema: serverMessageSchemas[key] ?? {},
	examples: toMessageExamples(serverMessageExamples, examples),
}));

const allMessages = [...clientMessages, ...serverMessages];

const componentName = (key: string) => `Stream${capitalize(key)}`;

/** `channels.stream`: the `/ws` address, its description and the messages that travel over it. */
export const streamChannel: JsonObject = {
	address: "/ws",
	title: "Camera frames in, gestures out",
	summary: "One socket per client: video frames in, gestures and state out.",
	description: STREAM_CHANNEL_DESCRIPTION,
	servers: [ref("servers/local")],
	tags: [{ name: STREAM_TAG }],
	bindings: { ws: { method: "GET", bindingVersion: "0.1.0" } },
	messages: Object.fromEntries(
		allMessages.map(({ key }) => [
			key,
			ref(`components/messages/${componentName(key)}`),
		]),
	),
};

/** Operations of the stream channel; `receive` is the server reading what the client sent. */
export const streamOperations: Record<string, JsonObject> = {
	...Object.fromEntries(
		clientMessages.map(({ key, title, summary }) => [
			`receive${capitalize(key)}`,
			operationOf({
				action: "receive",
				channel: CHANNEL,
				message: key,
				title: `Client sends: ${title}`,
				summary,
				tag: STREAM_TAG,
			}),
		]),
	),
	...Object.fromEntries(
		serverMessages.map(({ key, title, summary }) => [
			`send${capitalize(key)}`,
			operationOf({
				action: "send",
				channel: CHANNEL,
				message: key,
				title: `Server sends: ${title}`,
				summary,
				tag: STREAM_TAG,
			}),
		]),
	),
};

/** `components.messages` of the stream channel. */
export const streamMessages: Record<string, JsonObject> = Object.fromEntries(
	allMessages.map((spec) => [
		componentName(spec.key),
		messageOf({ ...spec, schemaName: componentName(spec.key) }),
	]),
);

/** `components.schemas` of the stream channel, reused from `stream.schemas.ts`. */
export const streamSchemas: Record<string, JsonObject> = Object.fromEntries(
	allMessages.map(({ key, schema }) => [
		componentName(key),
		toPlainSchema(schema),
	]),
);
