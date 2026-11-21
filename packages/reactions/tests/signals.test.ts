import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	GESTURE_EVENT_NAME,
	SIGNAL_EVENT_NAME,
	type SignalName,
	type SignalSample,
	type SignalValues,
} from "@repo/protocol";
import { Window } from "happy-dom";
import { createReactionFactory, type RuntimeEnvironment } from "../src/index";
import { MAX_HISTORY_SAMPLES } from "../src/signal-store";
import type { SignalsApi } from "../src/types";

interface Harness {
	window: Window;
	reaction: ReturnType<typeof createReactionFactory>;
	setNow: (value: number) => void;
	/** Delivers a sample the way the extension does; `at` defaults to the current time. */
	send: <Name extends SignalName>(
		signal: Name,
		value: SignalValues[Name],
		at?: number,
	) => void;
	sendRaw: (detail: unknown) => void;
}

function createHarness(): Harness {
	const window = new Window();
	let now = 0;
	const environment = {
		window,
		document: window.document,
		location: { href: "http://localhost/a" },
		transport: async () => "timeout",
		now: () => now,
	} as unknown as RuntimeEnvironment;
	const sendRaw = (detail: unknown) =>
		window.dispatchEvent(
			new window.CustomEvent(SIGNAL_EVENT_NAME, { detail: detail as object }),
		);

	return {
		window,
		reaction: createReactionFactory(() => environment),
		setNow: (value) => {
			now = value;
		},
		send: (signal, value, at = now) =>
			sendRaw({ signal, value, at } satisfies SignalSample),
		sendRaw,
	};
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Starts a reaction and hands back the `ctx.signals` the handlers see. */
async function openSignals(harness: Harness): Promise<SignalsApi> {
	let signals: SignalsApi | undefined;
	harness.reaction("probe").onGesture("nod", (ctx) => {
		signals = ctx.signals;
	});
	await tick();
	harness.window.dispatchEvent(
		new harness.window.CustomEvent(GESTURE_EVENT_NAME, {
			detail: { gesture: "nod", confidence: 1 },
		}),
	);
	await tick();
	if (!signals) throw new Error("the probe did not run");
	return signals;
}

let harness: Harness;
beforeEach(() => {
	harness = createHarness();
});
afterEach(async () => {
	await harness.window.happyDOM.close();
});

describe("onSignal", () => {
	test("receives the samples of its signal with a typed value", async () => {
		const seen: number[] = [];
		harness.reaction("a").onSignal("pulse", ({ sample }) => {
			seen.push(sample.value.bpm);
		});
		await tick();

		harness.send("pulse", { bpm: 70, confidence: 90, stable: true });
		harness.send("blink", { detected: true });
		harness.send("pulse", { bpm: 72, confidence: 90, stable: true });
		await tick();

		expect(seen).toEqual([70, 72]);
	});

	test("accepts a JSON string detail and ignores garbage", async () => {
		let count = 0;
		harness.reaction("a").onSignal("blink", () => {
			count += 1;
		});
		await tick();

		harness.sendRaw(
			JSON.stringify({ signal: "blink", value: { detected: true }, at: 1 }),
		);
		harness.sendRaw("not json");
		harness.sendRaw(null);
		harness.sendRaw({ signal: "gaze", value: {}, at: 1 });
		await tick();

		expect(count).toBe(1);
	});

	test("minIntervalMs skips samples that come too soon", async () => {
		const seen: number[] = [];
		harness.reaction("a").onSignal(
			"pose",
			({ sample }) => {
				seen.push(sample.value.yaw);
			},
			{ minIntervalMs: 100 },
		);
		await tick();

		for (const [time, yaw] of [
			[1000, 1],
			[1050, 2],
			[1100, 3],
		] as const) {
			harness.setNow(time);
			harness.send("pose", { yaw, pitch: 0 });
		}
		await tick();

		expect(seen).toEqual([1, 3]);
	});

	test("cooldown applies and minConfidence does not", async () => {
		const seen: number[] = [];
		harness
			.reaction("a")
			.cooldown(500)
			.minConfidence(0.99)
			.onSignal("breathing", ({ sample }) => {
				seen.push(sample.value.rate);
			});
		await tick();

		for (const [time, rate] of [
			[1000, 12],
			[1200, 13],
			[1600, 14],
		] as const) {
			harness.setNow(time);
			harness.send("breathing", { rate, confidence: 10, stable: false });
		}
		await tick();

		expect(seen).toEqual([12, 14]);
	});

	test("ctx.signals is available inside the handler", async () => {
		let blinks = 0;
		harness.reaction("a").onSignal("blink", (ctx) => {
			blinks = ctx.signals.blinks(2000);
		});
		await tick();

		harness.setNow(1000);
		harness.send("blink", { detected: false });
		harness.send("blink", { detected: true });
		harness.send("blink", { detected: false });
		harness.send("blink", { detected: true });
		await tick();

		expect(blinks).toBe(2);
	});
});

describe("ctx.signals", () => {
	test("latest returns the newest sample or undefined", async () => {
		const signals = await openSignals(harness);
		expect(signals.latest("pulse")).toBeUndefined();

		harness.send("pulse", { bpm: 60, confidence: 80, stable: true }, 1);
		harness.send("pulse", { bpm: 65, confidence: 80, stable: true }, 2);

		expect(signals.latest("pulse")?.value.bpm).toBe(65);
	});

	test("history is oldest first and honours withinMs", async () => {
		const signals = await openSignals(harness);
		harness.setNow(10_000);
		for (const at of [5000, 8000, 9500])
			harness.send("pose", { yaw: at, pitch: 0 }, at);

		expect(signals.history("pose").map((sample) => sample.at)).toEqual([
			5000, 8000, 9500,
		]);
		expect(
			signals.history("pose", { withinMs: 2500 }).map((sample) => sample.at),
		).toEqual([8000, 9500]);
	});

	test("history drops samples older than 60 seconds", async () => {
		const signals = await openSignals(harness);
		harness.setNow(1000);
		harness.send("pose", { yaw: 1, pitch: 0 }, 1000);
		harness.setNow(70_000);
		harness.send("pose", { yaw: 2, pitch: 0 }, 70_000);

		expect(signals.history("pose").map((sample) => sample.value.yaw)).toEqual([
			2,
		]);
	});

	test("history keeps at most 2000 samples per signal", async () => {
		const signals = await openSignals(harness);
		harness.setNow(1000);
		for (let index = 0; index < MAX_HISTORY_SAMPLES + 50; index++)
			harness.send("pose", { yaw: index, pitch: 0 }, 1000);

		const yaws = signals.history("pose").map((sample) => sample.value.yaw);
		expect(yaws).toHaveLength(MAX_HISTORY_SAMPLES);
		expect(yaws[0]).toBe(50);
	});

	test("blinks counts rising edges inside the window only", async () => {
		const signals = await openSignals(harness);
		harness.setNow(10_000);
		const edges: Array<[number, boolean]> = [
			[1000, false],
			[1100, true],
			[1200, false],
			[8000, true],
			[8100, false],
			[9000, true],
			[9100, true],
			[9200, false],
			[9800, true],
		];
		for (const [at, detected] of edges) harness.send("blink", { detected }, at);

		expect(signals.blinks(5000)).toBe(3);
		expect(signals.blinks(900)).toBe(1);
		expect(signals.blinks()).toBe(4);
		expect(signals.blinks(100)).toBe(0);
	});

	test("poseChange is the last pose minus the first in the window", async () => {
		const signals = await openSignals(harness);
		harness.setNow(5000);
		harness.send("pose", { yaw: -1, pitch: 0.5 }, 1000);
		harness.send("pose", { yaw: 0.1, pitch: 0.1 }, 4000);
		harness.send("pose", { yaw: 0.4, pitch: 0.3 }, 5000);

		const recent = signals.poseChange(2000);
		expect(recent.yaw).toBeCloseTo(0.3);
		expect(recent.pitch).toBeCloseTo(0.2);
		expect(signals.poseChange(100)).toEqual({ yaw: 0, pitch: 0 });
		expect(signals.poseChange().yaw).toBeCloseTo(1.4);
	});

	test("average of a numeric field, undefined without samples", async () => {
		const signals = await openSignals(harness);
		expect(signals.average("pulse", "bpm", 5000)).toBeUndefined();

		harness.setNow(5000);
		harness.send("pulse", { bpm: 60, confidence: 80, stable: true }, 1000);
		harness.send("pulse", { bpm: 70, confidence: 80, stable: true }, 4000);
		harness.send("pulse", { bpm: 80, confidence: 80, stable: true }, 4500);
		harness.send("expression", { HAPPY: 40 }, 4500);

		expect(signals.average("pulse", "bpm", 2000)).toBe(75);
		expect(signals.average("pulse", "bpm")).toBe(70);
		expect(signals.average("expression", "HAPPY")).toBe(40);
	});
});

describe("ctx.onSignal", () => {
	test("is removed with the element that started the handler", async () => {
		const modal = harness.window.document.createElement("div");
		modal.className = "modal";
		harness.window.document.body.append(modal);
		const seen: number[] = [];
		harness.reaction("a").onVisible(
			".modal",
			(ctx) => {
				ctx.onSignal("pose", ({ sample }) => {
					seen.push(sample.value.yaw);
				});
			},
			{ scope: false },
		);
		await tick();

		harness.send("pose", { yaw: 1, pitch: 0 });
		await tick();
		modal.setAttribute("hidden", "");
		await new Promise((resolve) => setTimeout(resolve, 350));
		harness.send("pose", { yaw: 2, pitch: 0 });
		await tick();

		expect(seen).toEqual([1]);
	});

	test("ctx.cancel inside a subscription removes only that subscription", async () => {
		const seen: number[] = [];
		harness.reaction("a").onGesture("nod", (ctx) => {
			ctx.onSignal("pose", ({ sample, cancel }) => {
				seen.push(sample.value.yaw);
				cancel();
			});
		});
		await tick();
		harness.window.dispatchEvent(
			new harness.window.CustomEvent(GESTURE_EVENT_NAME, {
				detail: { gesture: "nod", confidence: 1 },
			}),
		);
		await tick();

		harness.send("pose", { yaw: 1, pitch: 0 });
		await tick();
		harness.send("pose", { yaw: 2, pitch: 0 });
		await tick();

		expect(seen).toEqual([1]);
	});
});
