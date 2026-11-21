import { describe, expect, test } from "bun:test";
import type { WidgetMessage } from "../messages";
import { createPresence } from "./presence.service";

function setup() {
	const sent: Array<[number, WidgetMessage]> = [];
	let isQuestionOpen = false;
	const presence = createPresence({
		sendToWidget: (tabId, message) => sent.push([tabId, message]),
		isQuestionOpen: () => isQuestionOpen,
	});
	const presenceOf = (tabId: number, plugins: string[]) =>
		[tabId, { type: "widget/presence", plugins }] as const;
	return {
		presence,
		sent,
		presenceOf,
		openQuestion: (value: boolean) => {
			isQuestionOpen = value;
		},
	};
}

const gesture: WidgetMessage = { type: "widget/gesture", gesture: "shake" };

describe("Beta on the page of an always script", () => {
	test("the tab in front gets the scripts once, and again only when they change", () => {
		const h = setup();
		h.presence.update(1, ["scroll"]);
		h.presence.update(1, ["scroll"]);
		h.presence.update(1, ["scroll", "pinwheel"]);

		expect(h.sent).toEqual([
			h.presenceOf(1, ["scroll"]),
			h.presenceOf(1, ["scroll", "pinwheel"]),
		]);
	});

	test("the tab that was in front is cleared when another one takes the camera", () => {
		const h = setup();
		h.presence.update(1, ["scroll"]);
		h.presence.update(2, ["scroll"]);

		expect(h.sent.slice(1)).toEqual([
			h.presenceOf(1, []),
			h.presenceOf(2, ["scroll"]),
		]);
	});

	test("no scripts, or a paused tab, send Beta away", () => {
		const h = setup();
		h.presence.update(1, ["scroll"]);
		h.presence.update(1, []);
		h.presence.update(1, []);

		expect(h.sent).toEqual([h.presenceOf(1, ["scroll"]), h.presenceOf(1, [])]);
	});

	test("a page that reloads gets the scripts again when its widget is ready", () => {
		const h = setup();
		h.presence.update(1, ["scroll"]);
		h.presence.replay(1);
		h.presence.replay(2);

		expect(h.sent).toEqual([
			h.presenceOf(1, ["scroll"]),
			h.presenceOf(1, ["scroll"]),
		]);
	});

	test("gestures and expressions go only to the tab with Beta, and not while a question is open", () => {
		const h = setup();
		h.presence.follow({ type: "widget/gesture", gesture: "nod" });
		expect(h.sent).toEqual([]);

		h.presence.update(4, ["scroll"]);
		h.presence.follow(gesture as never);
		h.openQuestion(true);
		h.presence.follow(gesture as never);

		expect(
			h.sent.filter(([, message]) => message.type === "widget/gesture"),
		).toEqual([[4, gesture]]);
	});
});
