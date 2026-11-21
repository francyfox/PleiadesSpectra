import { type ClientMessage, signalNames } from "@repo/protocol";
import { z } from "zod";

const MAX_FRAME_SIDE = 1920;

const frameSide = z.number().int().positive().max(MAX_FRAME_SIDE);

function unique<T>(items: T[]): T[] {
	return [...new Set(items)];
}

const clientMessageSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("start"),
		width: frameSide,
		height: frameSide,
		debug: z.boolean().optional(),
		signals: z.array(z.enum(signalNames)).transform(unique).optional(),
	}),
	z.object({ type: z.literal("mask"), enabled: z.boolean() }),
	z.object({ type: z.literal("stop") }),
]);

/** Accepts a JSON string or an already parsed object; anything else is not a client message. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
	const value = typeof raw === "string" ? parseJson(raw) : raw;
	const result = clientMessageSchema.safeParse(value);
	return result.success ? result.data : null;
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}
