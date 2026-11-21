import {
	expressionNames,
	isGesture,
	isSignalName,
	type ServerMessage,
} from "@repo/protocol";

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
	return typeof value === "object" && value !== null;
}

function isExpressionScores(value: unknown): boolean {
	if (!isRecord(value)) return false;
	return Object.entries(value).every(
		([name, score]) =>
			(expressionNames as readonly string[]).includes(name) &&
			typeof score === "number",
	);
}

function isSignalSample(value: unknown): boolean {
	return (
		isRecord(value) &&
		isSignalName(value.signal) &&
		isRecord(value.value) &&
		typeof value.at === "number"
	);
}

function isServerMessage(value: unknown): value is ServerMessage {
	if (!isRecord(value)) return false;
	switch (value.type) {
		case "ready":
			return true;
		case "expression":
			return isExpressionScores(value.scores);
		case "gesture":
			return isGesture(value.gesture) && typeof value.confidence === "number";
		case "signal":
			return isSignalSample(value.sample);
		case "validation":
			return typeof value.code === "number" && typeof value.hint === "string";
		case "mask":
			return (
				typeof value.width === "number" &&
				typeof value.height === "number" &&
				Array.isArray(value.points) &&
				value.points.every((point) => typeof point === "number")
			);
		case "metrics":
			return "metrics" in value;
		case "error":
			return (
				typeof value.message === "string" &&
				typeof value.retryable === "boolean"
			);
		default:
			return false;
	}
}

/** Returns null for anything that is not a valid `ServerMessage` text frame. */
export function parseServerMessage(raw: unknown): ServerMessage | null {
	if (typeof raw !== "string") return null;
	try {
		const data: unknown = JSON.parse(raw);
		return isServerMessage(data) ? data : null;
	} catch {
		return null;
	}
}
