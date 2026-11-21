import { describe, expect, test } from "bun:test";
import {
	type AskEffect,
	type AskEvent,
	type AskRequest,
	type AskState,
	idleState,
	reduceAsk,
} from "./ask-machine";

const request: AskRequest = {
	pluginName: "Service rating",
	question: "How was our service?",
	timeoutMs: 8000,
	options: [
		{ value: "smile", label: "Good", gestureLabel: "smile" },
		{ value: "confused", label: "So-so", gestureLabel: "confused" },
	],
};

function run(events: AskEvent[], from: AskState = idleState) {
	let state = from;
	const effects: AskEffect[] = [];
	for (const event of events) {
		const step = reduceAsk(state, event);
		state = step.state;
		effects.push(...step.effects);
	}
	return { state, effects };
}

const startListening: AskEvent[] = [
	{ type: "ask-requested", request },
	{ type: "server-checked", online: true },
	{ type: "ready" },
];

const replies = (effects: AskEffect[]) =>
	effects.flatMap((effect) => (effect.type === "reply" ? [effect.answer] : []));

const widgetTypes = (effects: AskEffect[]) =>
	effects.flatMap((effect) =>
		effect.type === "widget" ? [effect.message.type] : [],
	);

describe("ask machine", () => {
	test("the answer time limit starts when the camera is ready, not when the question appears", () => {
		const beforeReady = run(startListening.slice(0, 2));
		const timerDurations = (effects: AskEffect[]) =>
			effects.flatMap((effect) =>
				effect.type === "set-timer" && effect.timer === "answer"
					? [effect.ms]
					: [],
			);
		expect(timerDurations(beforeReady.effects)).toEqual([]);

		const afterReady = run(startListening);
		expect(timerDurations(afterReady.effects)).toEqual([request.timeoutMs]);
	});

	test("every way an ask can end turns the camera off", () => {
		const endings: AskEvent[][] = [
			[{ type: "gesture", gesture: "smile" }],
			[{ type: "option-clicked", value: "smile" }],
			[{ type: "camera-off-clicked" }],
			[{ type: "timer-fired", timer: "answer" }],
			[{ type: "link-failed", message: "Lost connection to the server" }],
		];
		for (const ending of endings) {
			const { effects } = run([...startListening, ...ending]);
			expect(effects.some((effect) => effect.type === "stop-camera")).toBe(
				true,
			);
		}
	});

	test("an offline server ends the ask at once with an error", () => {
		const { state, effects } = run([
			{ type: "ask-requested", request },
			{ type: "server-checked", online: false },
		]);
		expect(state).toEqual(idleState);
		expect(replies(effects)).toEqual(["timeout"]);
		expect(effects).toContainEqual({
			type: "widget",
			message: { type: "widget/error", hint: "Server is offline" },
		});
		expect(effects.some((effect) => effect.type === "start-camera")).toBe(
			false,
		);
	});

	test("an expected gesture answers and stops the camera", () => {
		const { state, effects } = run([
			...startListening,
			{ type: "gesture", gesture: "smile" },
		]);
		expect(state).toEqual(idleState);
		expect(replies(effects)).toEqual(["smile"]);
		expect(effects.some((effect) => effect.type === "stop-camera")).toBe(true);
	});

	test("every gesture seen while the widget is open makes Beta strike a pose", () => {
		const { effects } = run([
			...startListening,
			{ type: "gesture", gesture: "nod" },
		]);
		const messages = effects.flatMap((effect) =>
			effect.type === "widget" ? [effect.message] : [],
		);
		expect(messages).toContainEqual({ type: "widget/gesture", gesture: "nod" });
	});

	test("an answering gesture also strikes its pose, before the widget closes", () => {
		const { effects } = run([
			...startListening,
			{ type: "gesture", gesture: "smile" },
		]);
		const types = effects.flatMap((effect) =>
			effect.type === "widget" ? [effect.message.type] : [],
		);
		expect(types.indexOf("widget/gesture")).toBeLessThan(
			types.indexOf("widget/accepted"),
		);
	});

	test("a gesture the script did not list is ignored", () => {
		const { state, effects } = run([
			...startListening,
			{ type: "gesture", gesture: "nod" },
		]);
		expect(state.phase).toBe("listening");
		expect(replies(effects)).toEqual([]);
	});

	test("gestures are ignored while the camera warms up", () => {
		const { state } = run([
			{ type: "ask-requested", request },
			{ type: "server-checked", online: true },
			{ type: "gesture", gesture: "smile" },
		]);
		expect(state.phase).toBe("warmup");
	});

	test("a mouse click answers during warm-up", () => {
		const { state, effects } = run([
			{ type: "ask-requested", request },
			{ type: "server-checked", online: true },
			{ type: "option-clicked", value: "confused" },
		]);
		expect(state).toEqual(idleState);
		expect(replies(effects)).toEqual(["confused"]);
	});

	test("timeout turns the camera off but still accepts a mouse answer", () => {
		const timedOut = run([
			...startListening,
			{ type: "timer-fired", timer: "answer" },
		]);
		expect(timedOut.state.phase).toBe("awaiting-click");
		expect(widgetTypes(timedOut.effects)).toContain("widget/timeout");
		expect(replies(timedOut.effects)).toEqual([]);

		const clicked = run(
			[{ type: "option-clicked", value: "smile" }],
			timedOut.state,
		);
		expect(replies(clicked.effects)).toEqual(["smile"]);
	});

	test("nobody answers after the timeout: reply timeout and hide", () => {
		const { state, effects } = run([
			...startListening,
			{ type: "timer-fired", timer: "answer" },
			{ type: "timer-fired", timer: "grace" },
		]);
		expect(state).toEqual(idleState);
		expect(replies(effects)).toEqual(["timeout"]);
		expect(widgetTypes(effects).at(-1)).toBe("widget/hide");
	});

	test("Turn off camera behaves like a timeout", () => {
		const { state } = run([...startListening, { type: "camera-off-clicked" }]);
		expect(state.phase).toBe("awaiting-click");
	});

	test("a camera that never gets ready fails with a hint", () => {
		const { state, effects } = run([
			{ type: "ask-requested", request },
			{ type: "server-checked", online: true },
			{ type: "timer-fired", timer: "ready" },
		]);
		expect(state).toEqual(idleState);
		expect(replies(effects)).toEqual(["timeout"]);
	});

	test("a link failure ends the ask with an error", () => {
		const { state, effects } = run([
			...startListening,
			{ type: "link-failed", message: "Lost connection to the server" },
		]);
		expect(state).toEqual(idleState);
		expect(effects).toContainEqual({
			type: "widget",
			message: { type: "widget/error", hint: "Lost connection to the server" },
		});
	});
});

describe("the place of the widget", () => {
	test("the widget message carries the place and the size of the request", () => {
		const { effects } = run([
			{
				type: "ask-requested",
				request: { ...request, position: { top: 8, right: 8 }, size: 200 },
			},
		]);
		const messages = effects.flatMap((effect) =>
			effect.type === "widget" ? [effect.message] : [],
		);
		expect(messages[0]).toMatchObject({
			type: "widget/ask",
			position: { top: 8, right: 8 },
			size: 200,
		});
	});
});
