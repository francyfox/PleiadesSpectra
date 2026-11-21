import { describe, expect, test } from "bun:test";
import type { WidgetMessage } from "../messages";
import { type AskDeps, createAskRunner } from "./ask-runner";

const request = {
	pluginName: "Service rating",
	question: "How was our service?",
	timeoutMs: 8000,
	options: [{ value: "smile" as const, label: "Good", gestureLabel: "smile" }],
};

function createFakeDeps(serverOnline = true) {
	const widgetMessages: WidgetMessage[] = [];
	const cameraCalls: string[] = [];
	let ready = false;
	const timers: Array<{ callback: () => void; ms: number }> = [];

	const deps: AskDeps = {
		checkServer: async () => serverOnline,
		sendToWidget: (_tabId, message) => widgetMessages.push(message),
		camera: {
			acquire: async (owner) => void cameraCalls.push(`acquire:${owner}`),
			release: async (owner) => void cameraCalls.push(`release:${owner}`),
			isReady: () => ready,
		},
		setTimer: (callback, ms) => timers.push({ callback, ms }),
		clearTimer: () => {},
	};
	return {
		deps,
		widgetMessages,
		cameraCalls,
		timers,
		setReady: (value: boolean) => {
			ready = value;
		},
	};
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("ask runner", () => {
	test("a gesture from the server resolves the ask and releases the camera", async () => {
		const fake = createFakeDeps();
		const runner = createAskRunner(fake.deps);

		const answer = runner.ask(request, 7);
		await flush();
		expect(runner.cameraOwner()).toBe("Service rating");
		runner.handleCameraEvent({ kind: "server", message: { type: "ready" } });
		runner.handleCameraEvent({
			kind: "server",
			message: { type: "gesture", gesture: "smile", confidence: 0.9 },
		});

		expect(await answer).toBe("smile");
		expect(fake.cameraCalls).toEqual([
			"acquire:Service rating",
			"release:Service rating",
		]);
		expect(fake.widgetMessages.map((message) => message.type)).toEqual([
			"widget/ask",
			"widget/listening",
			"widget/gesture",
			"widget/accepted",
		]);
		expect(runner.isBusy()).toBe(false);
	});

	test("an offline server resolves with timeout and never opens the camera", async () => {
		const fake = createFakeDeps(false);
		const runner = createAskRunner(fake.deps);

		expect(await runner.ask(request, 7)).toBe("timeout");
		expect(fake.cameraCalls).toEqual([]);
		expect(fake.widgetMessages.at(-1)).toEqual({
			type: "widget/error",
			hint: "Server is offline",
		});
	});

	test("a camera that is already ready (always mode) starts listening at once", async () => {
		const fake = createFakeDeps();
		fake.setReady(true);
		const runner = createAskRunner(fake.deps);

		void runner.ask(request, 7);
		await flush();
		expect(fake.widgetMessages.map((message) => message.type)).toContain(
			"widget/listening",
		);
	});

	test("a lost connection ends the ask", async () => {
		const fake = createFakeDeps();
		const runner = createAskRunner(fake.deps);

		const answer = runner.ask(request, 7);
		await flush();
		runner.handleCameraEvent({ kind: "lost" });
		expect(await answer).toBe("timeout");
		expect(fake.cameraCalls).toContain("release:Service rating");
	});

	test("the time limit counts from ready; after it only the mouse works, and then the ask times out", async () => {
		const fake = createFakeDeps();
		const runner = createAskRunner(fake.deps);

		const answer = runner.ask(request, 7);
		await flush();
		const answerTimerBeforeReady = fake.timers.some(
			(timer) => timer.ms === request.timeoutMs,
		);
		runner.handleCameraEvent({ kind: "server", message: { type: "ready" } });
		const answerTimer = fake.timers.find(
			(timer) => timer.ms === request.timeoutMs,
		);
		expect(answerTimerBeforeReady).toBe(false);
		expect(answerTimer).toBeDefined();

		answerTimer?.callback();
		expect(fake.cameraCalls).toContain("release:Service rating");
		expect(runner.isBusy()).toBe(true);
		expect(fake.widgetMessages.at(-1)?.type).toBe("widget/timeout");

		const graceTimer = fake.timers.at(-1);
		graceTimer?.callback();
		expect(await answer).toBe("timeout");
		expect(runner.isBusy()).toBe(false);
	});

	test("Turn off camera releases the camera but a mouse click still answers", async () => {
		const fake = createFakeDeps();
		const runner = createAskRunner(fake.deps);

		const answer = runner.ask(request, 7);
		await flush();
		runner.handleCameraEvent({ kind: "server", message: { type: "ready" } });
		runner.cameraOffClicked();
		expect(fake.cameraCalls).toContain("release:Service rating");

		runner.answerClicked("smile");
		expect(await answer).toBe("smile");
	});

	test("a tab that closes mid-question frees the camera and the script gets timeout", async () => {
		const fake = createFakeDeps();
		const runner = createAskRunner(fake.deps);
		const answer = runner.ask(request, 7);
		await flush();
		runner.handleCameraEvent({ kind: "server", message: { type: "ready" } });

		runner.pageGone(7);

		expect(await answer).toBe("timeout");
		expect(fake.widgetMessages.at(-1)).toEqual({ type: "widget/hide" });
		expect(fake.cameraCalls).toEqual([
			"acquire:Service rating",
			"release:Service rating",
		]);
		expect(runner.isBusy()).toBe(false);
	});

	test("another tab going away does not touch the question", async () => {
		const fake = createFakeDeps();
		const runner = createAskRunner(fake.deps);
		void runner.ask(request, 7);
		await flush();

		runner.pageGone(99);

		expect(runner.isBusy()).toBe(true);
	});
});

describe("ask queue", () => {
	const other = { ...request, pluginName: "Second script" };

	function setup() {
		const fake = createFakeDeps();
		const runner = createAskRunner(fake.deps);
		const answerWith = (value: string) => runner.answerClicked(value);
		return { fake, runner, answerWith };
	}

	test("a second question waits for the first, then runs in order", async () => {
		const { fake, runner, answerWith } = setup();
		const first = runner.ask(request, 1);
		const second = runner.ask(other, 1);
		await flush();
		expect(
			fake.widgetMessages.filter((m) => m.type === "widget/ask"),
		).toHaveLength(1);
		expect(runner.cameraOwner()).toBe("Service rating");

		answerWith("smile");
		expect(await first).toBe("smile");
		await flush();
		expect(runner.cameraOwner()).toBe("Second script");
		answerWith("smile");
		expect(await second).toBe("smile");
		expect(fake.cameraCalls).toEqual([
			"acquire:Service rating",
			"release:Service rating",
			"acquire:Second script",
			"release:Second script",
		]);
	});

	test("the answer timer of a waiting question starts when it is shown", async () => {
		const { fake, runner, answerWith } = setup();
		const first = runner.ask(request, 1);
		runner.ask({ ...other, timeoutMs: 1234 }, 1);
		await flush();
		fake.setReady(true);
		runner.handleCameraEvent({ kind: "server", message: { type: "ready" } });
		expect(fake.timers.some((t) => t.ms === 1234)).toBe(false);

		answerWith("smile");
		await first;
		await flush();
		runner.handleCameraEvent({ kind: "server", message: { type: "ready" } });
		expect(fake.timers.some((t) => t.ms === 1234)).toBe(true);
	});

	test("a waiting question of a gone tab is dropped with timeout", async () => {
		const { runner } = setup();
		runner.ask(request, 1);
		const dropped = runner.ask(other, 2);
		const kept = runner.ask(other, 1);
		runner.pageGone(2);
		expect(await dropped).toBe("timeout");
		runner.answerClicked("smile");
		await flush();
		expect(runner.cameraOwner()).toBe("Second script");
		runner.pageGone(1);
		expect(await kept).toBe("timeout");
		expect(runner.isBusy()).toBe(false);
	});

	test("the sixth waiting question gets timeout at once", async () => {
		const { runner } = setup();
		runner.ask(request, 1);
		for (let count = 0; count < 5; count++) runner.ask(other, 1);
		expect(await runner.ask(other, 1)).toBe("timeout");
	});

	test("isBusy stays true between questions of the queue", async () => {
		const { runner } = setup();
		runner.ask(request, 1);
		runner.ask(other, 1);
		runner.answerClicked("smile");
		expect(runner.isBusy()).toBe(true);
		runner.answerClicked("smile");
		expect(runner.isBusy()).toBe(false);
	});
});
