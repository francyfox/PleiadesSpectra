import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
	GESTURE_EVENT_NAME,
	type Gesture,
	SIGNAL_EVENT_NAME,
	type SignalName,
} from "@repo/protocol";
import { Window } from "happy-dom";
import { createReactionFactory, type RuntimeEnvironment } from "../src/index";
import type { PluginPermissions } from "../src/permissions";
import type { SignalsApi } from "../src/types";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function createHarness(permissions?: PluginPermissions) {
	const window = new Window();
	const environment = {
		window,
		document: window.document,
		location: { href: "http://localhost/a" },
		transport: async () => "timeout",
		now: () => 1000,
		permissions,
	} as unknown as RuntimeEnvironment;
	const dispatch = (name: string, detail: object) =>
		window.dispatchEvent(new window.CustomEvent(name, { detail }));
	return {
		window,
		reaction: createReactionFactory(() => environment),
		sendSignal: (signal: SignalName, value: object) =>
			dispatch(SIGNAL_EVENT_NAME, { signal, value, at: 1000 }),
		sendGesture: (gesture: Gesture) =>
			dispatch(GESTURE_EVENT_NAME, { gesture, confidence: 1 }),
	};
}

let warn: ReturnType<typeof spyOn<Console, "warn">>;
let harness: ReturnType<typeof createHarness>;

beforeEach(() => {
	warn = spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
	warn.mockRestore();
	await harness.window.happyDOM.close();
});

const warnings = () => warn.mock.calls.map((call) => String(call[0]));

/** Opens a handler that hands back `ctx.signals`, as the script would see it. */
async function openSignals(): Promise<SignalsApi> {
	let signals: SignalsApi | undefined;
	harness.reaction("probe").onGesture("nod", (ctx) => {
		signals = ctx.signals;
	});
	await tick();
	harness.sendGesture("nod");
	await tick();
	if (!signals) throw new Error("the probe did not run");
	return signals;
}

describe("signal permissions", () => {
	test("a declared signal reaches onSignal and the history; an undeclared one does not", async () => {
		harness = createHarness({ signals: ["blink"], gestures: ["nod"] });
		const seen: string[] = [];
		harness.reaction("a").onSignal("blink", () => {
			seen.push("blink");
		});
		harness.reaction("b").onSignal("pulse", () => {
			seen.push("pulse");
		});
		const signals = await openSignals();

		harness.sendSignal("blink", { detected: true });
		harness.sendSignal("pulse", { bpm: 70, confidence: 90, stable: true });
		await tick();

		expect(seen).toEqual(["blink"]);
		expect(signals.latest("blink")?.value).toEqual({ detected: true });
		expect(signals.latest("pulse")).toBeUndefined();
		expect(signals.history("pulse")).toEqual([]);
		expect(signals.average("pulse", "bpm")).toBeUndefined();
	});

	test("without a config everything passes", async () => {
		harness = createHarness();
		const seen: string[] = [];
		harness.reaction("a").onSignal("pulse", () => {
			seen.push("pulse");
		});
		const signals = await openSignals();

		harness.sendSignal("pulse", { bpm: 70, confidence: 90, stable: true });
		await tick();

		expect(seen).toEqual(["pulse"]);
		expect(signals.latest("pulse")).toBeDefined();
		expect(warnings()).toEqual([]);
	});

	test("an empty declaration lets nothing through", async () => {
		harness = createHarness({ signals: [], gestures: ["nod"] });
		const signals = await openSignals();

		harness.sendSignal("blink", { detected: true });
		await tick();

		expect(signals.latest("blink")).toBeUndefined();
		expect(signals.blinks(1000)).toBe(0);
		expect(signals.poseChange(1000)).toEqual({ yaw: 0, pitch: 0 });
	});

	test("the warning is printed once per signal, however often it is dropped or read", async () => {
		harness = createHarness({ signals: ["blink"], gestures: ["nod"] });
		harness.reaction("a").onSignal("pulse", () => {});
		const signals = await openSignals();

		for (let index = 0; index < 3; index++) {
			harness.sendSignal("pulse", { bpm: 70, confidence: 90, stable: true });
			signals.latest("pulse");
		}
		await tick();

		const pulseWarnings = warnings().filter((text) => text.includes('"pulse"'));
		expect(pulseWarnings).toHaveLength(1);
		expect(pulseWarnings[0]).toContain(
			'signal "pulse" is not declared in @signals, so this script does not get it',
		);
	});

	test("registering onSignal for an undeclared signal warns right away", async () => {
		harness = createHarness({ signals: [], gestures: [] });
		harness.reaction("a").onSignal("pulse", () => {});
		await tick();

		expect(warnings().some((text) => text.includes('"pulse"'))).toBe(true);
	});
});

describe("gesture permissions", () => {
	test("a declared gesture fires and an undeclared one does not", async () => {
		harness = createHarness({ signals: [], gestures: ["nod"] });
		const seen: string[] = [];
		harness
			.reaction("a")
			.onGesture("nod", () => {
				seen.push("nod");
			})
			.onGesture("shake", () => {
				seen.push("shake");
			});
		await tick();

		harness.sendGesture("nod");
		harness.sendGesture("shake");
		await tick();

		expect(seen).toEqual(["nod"]);
		const shakeWarnings = warnings().filter((text) => text.includes('"shake"'));
		expect(shakeWarnings).toHaveLength(1);
		expect(shakeWarnings[0]).toContain("is not declared in @gestures");
	});

	test("ctx.onGesture inside a handler is filtered too", async () => {
		harness = createHarness({ signals: [], gestures: ["nod"] });
		const seen: string[] = [];
		harness.reaction("a").onGesture("nod", (ctx) => {
			ctx.onGesture("smile", () => {
				seen.push("smile");
			});
		});
		await tick();

		harness.sendGesture("nod");
		await tick();
		harness.sendGesture("smile");
		await tick();

		expect(seen).toEqual([]);
		expect(warnings().some((text) => text.includes('"smile"'))).toBe(true);
	});

	test("without a config every gesture fires", async () => {
		harness = createHarness();
		const seen: string[] = [];
		harness.reaction("a").onGesture("shake", () => {
			seen.push("shake");
		});
		await tick();

		harness.sendGesture("shake");
		await tick();

		expect(seen).toEqual(["shake"]);
		expect(warnings()).toEqual([]);
	});

	test("ask warns once about undeclared gestures in expect and still resolves", async () => {
		harness = createHarness({ signals: [], gestures: ["nod"] });
		const answers: string[] = [];
		harness.reaction("a").onGesture("nod", async (ctx) => {
			answers.push(await ctx.ask("?", { expect: ["nod", "smile"] }));
			answers.push(await ctx.ask("?", { expect: ["smile"] }));
		});
		await tick();

		harness.sendGesture("nod");
		await tick();
		await tick();

		expect(answers).toEqual(["timeout", "timeout"]);
		const smileWarnings = warnings().filter((text) => text.includes('"smile"'));
		expect(smileWarnings).toHaveLength(1);
	});
});
