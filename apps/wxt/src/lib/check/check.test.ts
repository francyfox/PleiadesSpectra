import { describe, expect, test } from "bun:test";
import type { CameraController } from "../camera/camera-controller";
import type { CameraEvent } from "../camera/camera-events";
import { createConsoleLogger } from "./check.console";
import {
	CHECK_MAX_MS,
	CHECK_OWNER,
	type CheckView,
	type SpectraLogEntry,
} from "./check.model";
import { createCheckService } from "./check.service";

const ready: CameraEvent = { kind: "server", message: { type: "ready" } };

function expression(name: "HAPPY" | "SAD", score: number): CameraEvent {
	return {
		kind: "server",
		message: { type: "expression", scores: { [name]: score } },
	};
}

function createHarness(options: { serverOnline?: boolean } = {}) {
	let now = 1000;
	const camera = { acquired: [] as string[], released: [] as string[] };
	const views: CheckView[] = [];
	const logs: SpectraLogEntry[] = [];
	const timers = new Map<number, () => void>();
	let nextTimer = 1;

	const fakeCamera = {
		acquire: async (owner: string) => void camera.acquired.push(owner),
		release: async (owner: string) => void camera.released.push(owner),
	} as unknown as CameraController;

	const service = createCheckService({
		camera: fakeCamera,
		checkServer: async () => options.serverOnline ?? true,
		now: () => now,
		setTimer: (callback) => {
			const id = nextTimer++;
			timers.set(id, callback);
			return id;
		},
		clearTimer: (handle) => void timers.delete(handle as number),
		publishView: (view) => views.push(view),
		publishLog: (entry) => logs.push(entry),
	});

	return {
		service,
		camera,
		views,
		logs,
		advance: (ms: number) => {
			now += ms;
		},
		fireLimit: () => {
			for (const callback of timers.values()) callback();
		},
		lastEmotion: () => service.view().emotion,
	};
}

describe("the Spectra check", () => {
	test("it shows the emotion Spectra reports once it is ready", async () => {
		const harness = createHarness();
		await harness.service.start();

		harness.service.handleCameraEvent(ready);
		harness.advance(500);
		harness.service.handleCameraEvent(expression("HAPPY", 85));

		expect(harness.camera.acquired).toEqual([CHECK_OWNER]);
		expect(harness.service.view().status).toBe("running");
		expect(harness.lastEmotion()).toBe("happy");
	});

	test("an error from Spectra blocks the check, shows the neutral face and frees the camera", async () => {
		const harness = createHarness();
		await harness.service.start();
		harness.service.handleCameraEvent(ready);

		harness.service.handleCameraEvent({
			kind: "server",
			message: { type: "error", message: "No API key", retryable: false },
		});
		harness.advance(500);
		harness.service.handleCameraEvent(expression("HAPPY", 90));

		expect(harness.service.view().status).toBe("blocked");
		expect(harness.lastEmotion()).toBe("neutral");
		expect(harness.service.view().reason).toBe("No API key");
		expect(harness.camera.released).toEqual([CHECK_OWNER]);
	});

	test("an offline server blocks the check without touching the camera", async () => {
		const harness = createHarness({ serverOnline: false });

		await harness.service.start();

		expect(harness.service.view().status).toBe("blocked");
		expect(harness.lastEmotion()).toBe("neutral");
		expect(harness.service.view().reason).toBe("Server is offline");
		expect(harness.camera.acquired).toEqual([]);
	});

	test("a camera that cannot start is reported as blocked", async () => {
		const harness = createHarness();
		await harness.service.start();

		harness.service.handleCameraEvent({
			kind: "failed",
			reason: "permission",
			message: "Camera access was not granted",
		});

		expect(harness.service.view().status).toBe("blocked");
		expect(harness.lastEmotion()).toBe("neutral");
	});

	test("stopping and the time limit both turn the camera off", async () => {
		const stopped = createHarness();
		await stopped.service.start();
		await stopped.service.stop();

		const limited = createHarness();
		await limited.service.start();
		limited.fireLimit();
		await Promise.resolve();

		expect(stopped.camera.released).toEqual([CHECK_OWNER]);
		expect(stopped.service.view().status).toBe("idle");
		expect(limited.camera.released).toEqual([CHECK_OWNER]);
		expect(CHECK_MAX_MS).toBeGreaterThan(0);
	});
});

describe("the log of what Spectra sent back", () => {
	test("every answer is logged whole, so the console can show all of its fields", async () => {
		const harness = createHarness();
		await harness.service.start();
		const answer: CameraEvent = {
			kind: "server",
			message: {
				type: "expression",
				scores: { HAPPY: 12, SAD: 3, ANGRY: 80, FEAR: 5 },
			},
		};

		for (let step = 0; step < 25; step += 1) {
			harness.service.handleCameraEvent(answer);
			harness.advance(100);
		}
		harness.service.handleCameraEvent({
			kind: "server",
			message: { type: "validation", code: 5, hint: "Too dark" },
		});

		const expressionLines = harness.logs.filter((entry) =>
			entry.text.startsWith("expression"),
		);
		expect(expressionLines).toHaveLength(25);
		expect(expressionLines[0]?.payload).toEqual(
			answer.kind === "server" ? answer.message : null,
		);
		expect(
			harness.logs.filter((entry) => entry.text.startsWith("validation")),
		).toHaveLength(1);
	});

	test("no check, no log: the traffic of a session that scripts use is not the check's", () => {
		const harness = createHarness();

		harness.service.handleCameraEvent({
			kind: "server",
			message: { type: "expression", scores: { HAPPY: 80 } },
		});
		harness.service.handleCameraEvent({
			kind: "server",
			message: { type: "gesture", gesture: "smile", confidence: 0.91 },
		});

		expect(harness.logs).toEqual([]);
	});

	test("failures are logged even when no check is running", () => {
		const harness = createHarness();

		harness.service.handleCameraEvent({
			kind: "failed",
			reason: "camera",
			message: "The camera is busy",
		});

		expect(harness.logs.map((entry) => entry.text)).toEqual([
			"camera failed (camera): The camera is busy",
		]);
	});

	test("a running check logs the emotions and not the gestures, the signals or the rest of the SDK payload", async () => {
		const harness = createHarness();
		await harness.service.start();
		harness.service.handleCameraEvent(ready);

		harness.service.handleCameraEvent({
			kind: "server",
			message: { type: "gesture", gesture: "talking", confidence: 0.8 },
		});
		harness.service.handleCameraEvent({
			kind: "server",
			message: {
				type: "signal",
				sample: { signal: "blink", value: { detected: true }, at: 1 },
			},
		});
		harness.service.handleCameraEvent({
			kind: "server",
			message: {
				type: "metrics",
				metrics: {
					face: {
						blinking: [{ detected: true }],
						talking: [{ detected: true }],
						expression: [{ scores: [{ type: 5, confidence: 90 }] }],
					},
				},
			},
		});

		const texts = harness.logs.map((entry) => entry.text);
		expect(texts.some((text) => text.startsWith("gesture"))).toBe(false);
		const metrics = harness.logs.find((entry) =>
			entry.text.startsWith("metrics"),
		);
		expect(metrics?.payload).toEqual({
			face: { expression: [{ scores: [{ type: 5, confidence: 90 }] }] },
		});
	});
});

describe("the console output", () => {
	test("it prints only while Show logs is on, and failures as warnings", async () => {
		let enabled = false;
		const printed: string[] = [];
		const print = createConsoleLogger({
			isEnabled: () => enabled,
			info: (line) => printed.push(`info ${line}`),
			warn: (line) => printed.push(`warn ${line}`),
		});
		const harness = createHarness();
		await harness.service.start();
		harness.service.handleCameraEvent(ready);
		harness.service.handleCameraEvent({
			kind: "server",
			message: { type: "error", message: "No API key", retryable: false },
		});

		for (const entry of harness.logs) print(entry);
		const whileOff = printed.length;
		enabled = true;
		for (const entry of harness.logs) print(entry);

		expect(whileOff).toBe(0);
		expect(
			printed.some(
				(line) => line.startsWith("info ") && line.includes("ready"),
			),
		).toBe(true);
		expect(
			printed.some(
				(line) => line.startsWith("warn ") && line.includes("No API key"),
			),
		).toBe(true);
	});
});
