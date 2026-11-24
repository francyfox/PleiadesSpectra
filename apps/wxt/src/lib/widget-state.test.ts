import { describe, expect, test } from "bun:test";
import type { WidgetMessage } from "./messages";
import {
	applyMessage,
	cameraBadgeTextOf,
	createInitialState,
	emotionOf,
	isMeasuring,
	isPausable,
	isQuestionVisible,
	isVisible,
	NO_SIGNAL_AFTER_MS,
	poseOf,
	pulseOf,
	statusTextOf,
	type WidgetState,
} from "./widget-state";

function apply(
	messages: Array<[WidgetMessage, number]>,
	from: WidgetState = createInitialState(),
) {
	return messages.reduce(
		(state, [message, nowMs]) => applyMessage(state, message, nowMs),
		from,
	);
}

const gesture = (name: string): WidgetMessage => ({
	type: "widget/gesture",
	gesture: name,
});

describe("poses", () => {
	test("a head gesture shows its pose for a moment and then the drawn face comes back", () => {
		const state = apply([[gesture("tilt-up"), 1000]]);

		expect(poseOf(state, 1500)).toEqual({ name: "top", isMirrored: false });
		expect(poseOf(state, 1899)?.name).toBe("top");
		expect(poseOf(state, 1900)).toBeNull();
	});

	test("an expression has no pose", () => {
		expect(poseOf(apply([[gesture("smile"), 0]]), 10)).toBeNull();
	});

	test("shake turns to one side and the next shake to the other", () => {
		const first = apply([[gesture("shake"), 0]]);
		const second = apply([[gesture("shake"), 2000]], first);
		const third = apply([[gesture("shake"), 4000]], second);

		expect(poseOf(first, 10)).toEqual({ name: "rotate", isMirrored: true });
		expect(poseOf(second, 2010)).toEqual({ name: "rotate", isMirrored: false });
		expect(poseOf(third, 4010)?.isMirrored).toBe(true);
	});

	test("a shown pulse that waits for its first sample makes Beta spin the pinwheel, the loader", () => {
		const state = apply([[showVital("pulse"), 0]]);

		expect(poseOf(state, 100)).toEqual({ name: "blow", isMirrored: false });
	});

	test("a gesture pose wins over the pinwheel, and the pinwheel comes back after it", () => {
		const state = apply([
			[showVital("pulse"), 0],
			[gesture("nod"), 1000],
		]);

		expect(poseOf(state, 1100)?.name).toBe("down");
		expect(poseOf(state, 2000)?.name).toBe("blow");
	});

	test("the pulse shows the heart with the number, for ten seconds after the last sample", () => {
		const state = apply([[{ type: "widget/pulse", bpm: 74, stable: true }, 0]]);

		expect(poseOf(state, 5000)).toEqual({ name: "heart", isMirrored: false });
		expect(pulseOf(state)).toMatchObject({ bpm: 74, stable: true });
		expect(poseOf(state, 10_000)).toBeNull();
	});

	test("closing the widget forgets the poses", () => {
		const state = apply([
			[gesture("nod"), 0],
			[{ type: "widget/pulse", bpm: 74, stable: true }, 0],
			[{ type: "widget/hide" }, 10],
		]);

		expect(poseOf(state, 20)).toBeNull();
	});
});

const showVital = (vital: "pulse", position?: "top-left"): WidgetMessage => ({
	type: "widget/show-vital",
	vital,
	position,
});

const askMessage: WidgetMessage = {
	type: "widget/ask",
	pluginName: "p",
	question: "q?",
	options: [],
	position: "center",
};

describe("a shown vital without a question", () => {
	test("Beta is visible without a question and has no question card; hiding takes her away", () => {
		const shown = apply([[showVital("pulse"), 0]]);
		expect(isVisible(shown)).toBe(true);
		expect(isQuestionVisible(shown)).toBe(false);
		expect(shown.look.position).toBe("bottom-right");

		const hidden = apply([[{ type: "widget/hide-vital" }, 1]], shown);
		expect(isVisible(hidden)).toBe(false);
	});

	test("the show takes its place and size", () => {
		const shown = apply([[showVital("pulse", "top-left"), 0]]);
		expect(shown.look.position).toBe("top-left");
	});

	test("until a sample comes Beta says she is measuring and spins the pinwheel, then the heart shows and the pinwheel comes back after the TTL", () => {
		const shown = apply([[showVital("pulse"), 0]]);
		expect(isMeasuring(shown, 100)).toBe(true);
		expect(statusTextOf(shown, 100)).toBe("measuring…");
		expect(poseOf(shown, 100)?.name).toBe("blow");

		const sampled = apply(
			[[{ type: "widget/pulse", bpm: 70, stable: true }, 1000]],
			shown,
		);
		expect(isMeasuring(sampled, 2000)).toBe(false);
		expect(poseOf(sampled, 2000)?.name).toBe("heart");
		expect(poseOf(sampled, 11_000)?.name).toBe("blow");
		expect(isMeasuring(sampled, 11_000)).toBe(true);
	});

	test("a gesture still covers the pose for a moment", () => {
		const state = apply([
			[showVital("pulse"), 0],
			[{ type: "widget/pulse", bpm: 70, stable: true }, 10],
			[gesture("nod"), 20],
		]);
		expect(poseOf(state, 100)?.name).toBe("down");
		expect(poseOf(state, 1000)?.name).toBe("heart");
	});

	test("a repeated show moves Beta and keeps the samples that came", () => {
		const state = apply([
			[showVital("pulse"), 0],
			[{ type: "widget/pulse", bpm: 70, stable: true }, 10],
			[showVital("pulse", "top-left"), 20],
		]);
		expect(state.shownVital).toBe("pulse");
		expect(pulseOf(state)).toMatchObject({ bpm: 70 });
		expect(state.look.position).toBe("top-left");
	});
});

describe("a question and a shown vital together", () => {
	test("the question wins while it is open, and the show comes back after it", () => {
		const asked = apply([
			[showVital("pulse", "top-left"), 0],
			[askMessage, 10],
		]);
		expect(asked.phase).toBe("warmup");
		expect(asked.look.position).toBe("center");
		expect(isQuestionVisible(asked)).toBe(true);
		expect(asked.shownVital).toBe("pulse");

		const ended = apply([[{ type: "widget/hide" }, 20]], asked);
		expect(ended.phase).toBe("idle");
		expect(isVisible(ended)).toBe(true);
		expect(ended.look.position).toBe("top-left");
	});

	test("hiding the vital during a question leaves the question, and it is gone after the question", () => {
		const asked = apply([
			[showVital("pulse"), 0],
			[askMessage, 10],
			[{ type: "widget/hide-vital" }, 20],
		]);
		expect(asked.phase).toBe("warmup");
		expect(asked.shownVital).toBeNull();

		const ended = apply([[{ type: "widget/hide" }, 30]], asked);
		expect(isVisible(ended)).toBe(false);
	});

	test("a question without any show hides Beta as before", () => {
		const ended = apply([
			[askMessage, 0],
			[{ type: "widget/hide" }, 10],
		]);
		expect(isVisible(ended)).toBe(false);
	});
});

describe("a measurement that does not come", () => {
	const show = (nowMs: number) =>
		apply([[{ type: "widget/show-vital", vital: "pulse" }, nowMs]]);

	test("Beta says measuring at first, and no signal when nothing came for a while", () => {
		const state = show(1000);

		expect(statusTextOf(state, 2000)).toBe("measuring…");
		expect(statusTextOf(state, 1000 + NO_SIGNAL_AFTER_MS)).toBe("no signal");
	});

	test("a sample ends the wait", () => {
		const state = apply(
			[[{ type: "widget/pulse", bpm: 70, stable: true }, 20_000]],
			show(1000),
		);

		expect(statusTextOf(state, 21_000)).toBe("");
	});
});

describe("presence of always scripts", () => {
	const presence = (plugins: string[]): WidgetMessage => ({
		type: "widget/presence",
		plugins,
	});

	test("Beta comes with the scripts, in the size of the window and in the usual corner, and goes when they go", () => {
		const there = apply([[presence(["scroll"]), 0]]);
		expect(isVisible(there)).toBe(true);
		expect(isQuestionVisible(there)).toBe(false);
		expect(there.look).toEqual({ position: "bottom-right", size: "auto" });
		expect(cameraBadgeTextOf(there)).toBe("scroll");
		expect(isPausable(there)).toBe(true);

		const gone = applyMessage(there, presence([]), 1);
		expect(isVisible(gone)).toBe(false);
	});

	test("several scripts are counted, not listed", () => {
		const state = apply([[presence(["a", "b"]), 0]]);
		expect(cameraBadgeTextOf(state)).toBe("2 scripts");
	});

	test("a question takes the look and ends, and Beta stays in the size of the window for the scripts", () => {
		const ask: WidgetMessage = {
			type: "widget/ask",
			pluginName: "rate",
			question: "?",
			options: [],
			size: "large",
		};
		const asking = apply([
			[presence(["scroll"]), 0],
			[ask, 1],
		]);
		expect(asking.look.size).toBe("large");
		expect(asking.presence).toEqual(["scroll"]);
		expect(isPausable(asking)).toBe(false);

		const after = applyMessage(asking, { type: "widget/hide" }, 2);
		expect(isVisible(after)).toBe(true);
		expect(after.look.size).toBe("auto");
	});

	test("after a question without presence Beta is gone", () => {
		const after = apply([
			[
				{
					type: "widget/ask",
					pluginName: "rate",
					question: "?",
					options: [],
				},
				0,
			],
			[{ type: "widget/hide" }, 1],
		]);
		expect(isVisible(after)).toBe(false);
	});

	test("a shown measurement keeps its own look, and presence waits behind it", () => {
		const shown = apply([
			[{ type: "widget/show-vital", vital: "pulse", size: "large" }, 0],
			[presence(["scroll"]), 1],
		]);
		expect(shown.look.size).toBe("large");

		const hidden = applyMessage(shown, { type: "widget/hide-vital" }, 2);
		expect(isVisible(hidden)).toBe(true);
		expect(hidden.look.size).toBe("auto");
	});

	test("a pose and the face follow the camera of the scripts without a question", () => {
		const state = apply([
			[presence(["scroll"]), 0],
			[gesture("nod"), 100],
			[
				{
					type: "widget/expression",
					scores: { HAPPY: 90 } as never,
				},
				5000,
			],
		]);
		expect(poseOf(state, 200)?.name).toBe("down");
		expect(emotionOf(state)).toBe("happy");
	});
});
