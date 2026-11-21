import { expect, test } from "bun:test";
import { parseClientMessage } from "./client-message";

const start = { type: "start", width: 640, height: 480 } as const;

test("start without signals stays valid", () => {
	expect(parseClientMessage(JSON.stringify(start))).toEqual(start);
});

test("known signals are accepted and duplicates collapse", () => {
	const message = parseClientMessage({
		...start,
		signals: ["blink", "pulse", "blink"],
	});
	expect(message).toMatchObject({ signals: ["blink", "pulse"] });
});

test("an unknown signal name makes the whole message malformed, like any other bad field", () => {
	expect(parseClientMessage({ ...start, signals: ["gaze"] })).toBeNull();
	expect(parseClientMessage({ ...start, signals: "pulse" })).toBeNull();
});

test("a mask message carries a boolean", () => {
	expect(parseClientMessage({ type: "mask", enabled: true })).toEqual({
		type: "mask",
		enabled: true,
	});
	expect(parseClientMessage({ type: "mask" })).toBeNull();
	expect(parseClientMessage({ type: "mask", enabled: "yes" })).toBeNull();
});
