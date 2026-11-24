import { describe, expect, test } from "bun:test";
import type { ClientMessage } from "@repo/protocol";
import { createStreamLog } from "./stream-log";

function setup() {
	const lines: string[] = [];
	let nowMs = 1_000;
	const log = createStreamLog(
		(line) => lines.push(line),
		() => nowMs,
	);
	return {
		log,
		lines,
		advance: (ms: number) => {
			nowMs += ms;
		},
	};
}

const START: Extract<ClientMessage, { type: "start" }> = {
	type: "start",
	width: 640,
	height: 480,
	signals: ["pulse"],
};

const pulse = (stable: boolean) =>
	({
		type: "signal",
		sample: {
			signal: "pulse",
			value: { bpm: 72.4, confidence: 90, stable },
			at: 0,
		},
	}) as const;

describe("the console log of a measurement session", () => {
	test("it says what was asked for and how the face and the advice of the SDK went", () => {
		const h = setup();
		h.log.started(START);
		h.advance(2500);
		h.log.sent({
			type: "validation",
			code: 7,
			hint: "Place more of the chest in view.",
		});
		h.advance(500);
		h.log.sent({ type: "ready" });
		h.log.sent({ type: "validation", code: 0, hint: "" });

		expect(h.lines).toEqual([
			"[stream 0.0 s] start 640x480, signals: pulse",
			"[stream 2.5 s] validation 7: Place more of the chest in view.",
			"[stream 3.0 s] ready (the face is found)",
			"[stream 3.0 s] validation ok",
		]);
	});

	test("a vital is printed at its first sample and when its stability changes, not on every sample", () => {
		const h = setup();
		h.log.started(START);
		for (const stable of [false, false, true, true, true, false])
			h.log.sent(pulse(stable));

		expect(h.lines.slice(1).map((line) => line.split("] ")[1])).toEqual([
			"pulse 72 bpm (confidence 90, not stable)",
			"pulse 72 bpm (confidence 90, stable)",
			"pulse 72 bpm (confidence 90, not stable)",
		]);
	});

	test("the summary is printed once, with the number of samples of each signal", () => {
		const h = setup();
		h.log.started(START);
		h.log.sent(pulse(true));
		h.log.sent(pulse(true));
		h.log.stopped();
		h.log.stopped();

		expect(h.lines.at(-1)).toBe("[stream 0.0 s] stop, samples: pulse 2");
		expect(h.lines.filter((line) => line.includes("stop,"))).toHaveLength(1);
	});

	test("nothing is printed before the session has started, and expressions are never printed", () => {
		const h = setup();
		h.log.sent({ type: "ready" });
		h.log.started(START);
		h.log.sent({ type: "expression", scores: { HAPPY: 80 } });

		expect(h.lines).toEqual(["[stream 0.0 s] start 640x480, signals: pulse"]);
	});
});
