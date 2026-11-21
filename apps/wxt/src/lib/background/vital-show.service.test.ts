import { describe, expect, test } from "bun:test";
import type { WidgetMessage } from "../messages";
import {
	createVitalShowService,
	isHideVitalMessage,
	isShowVitalMessage,
	widgetMessageForShow,
} from "./vital-show.service";

function setup() {
	const sent: Array<[number, WidgetMessage]> = [];
	const service = createVitalShowService({
		sendToWidget: (tabId, message) => sent.push([tabId, message]),
	});
	return { sent, service };
}

const show = (pluginName: string, vital: "pulse" | "breathing" = "pulse") =>
	({ type: "reaction/show", pluginName, vital }) as const;

describe("reaction/show and reaction/hide messages", () => {
	test("a show needs a known vital and a script name", () => {
		expect(isShowVitalMessage(show("a"))).toBe(true);
		expect(isShowVitalMessage({ ...show("a"), vital: "gaze" })).toBe(false);
		expect(isShowVitalMessage({ type: "reaction/show", vital: "pulse" })).toBe(
			false,
		);
		expect(isHideVitalMessage({ type: "reaction/hide", pluginName: "a" })).toBe(
			true,
		);
		expect(isHideVitalMessage({ type: "reaction/hide" })).toBe(false);
	});

	test("position and size are checked as for a question", () => {
		expect(
			widgetMessageForShow({
				vital: "pulse",
				position: "nowhere" as never,
				size: 5 as never,
			}),
		).toEqual({
			type: "widget/show-vital",
			vital: "pulse",
			position: undefined,
			size: 60,
		});
		expect(
			widgetMessageForShow({
				vital: "pulse",
				position: "top-left",
				size: "large",
			}),
		).toMatchObject({ position: "top-left", size: "large" });
	});
});

describe("vital show service", () => {
	test("the show goes to the tab of the script and hide takes it away", () => {
		const { sent, service } = setup();
		service.show(show("a"), 7);
		service.hide("a", 7);

		expect(sent.map(([tabId, message]) => [tabId, message.type])).toEqual([
			[7, "widget/show-vital"],
			[7, "widget/hide-vital"],
		]);
	});

	test("a repeated show of the same script replaces the earlier one", () => {
		const { sent, service } = setup();
		service.show(show("a", "pulse"), 7);
		service.show(show("a", "breathing"), 7);
		service.hide("a", 7);

		expect(sent.at(-1)?.[1].type).toBe("widget/hide-vital");
		expect(sent[1]?.[1]).toMatchObject({ vital: "breathing" });
	});

	test("when one of two scripts hides, the widget goes back to the other", () => {
		const { sent, service } = setup();
		service.show(show("a", "pulse"), 7);
		service.show(show("b", "breathing"), 7);
		service.hide("b", 7);

		expect(sent.at(-1)?.[1]).toMatchObject({
			type: "widget/show-vital",
			vital: "pulse",
		});
	});

	test("tabs do not mix, and a gone page forgets its shows", () => {
		const { sent, service } = setup();
		service.show(show("a"), 7);
		service.show(show("b"), 8);
		service.pageGone(7);
		service.hide("b", 8);

		expect(sent.at(-1)).toEqual([8, { type: "widget/hide-vital" }]);
		service.hide("a", 7);
		expect(sent.at(-1)).toEqual([7, { type: "widget/hide-vital" }]);
	});
});

describe("a show that began before the widget was listening", () => {
	test("the newest show of the tab is sent again when the widget is ready, and nothing when there is none", () => {
		const sent: Array<[number, unknown]> = [];
		const service = createVitalShowService({
			sendToWidget: (tabId, message) => sent.push([tabId, message]),
		});

		service.replay(7);
		expect(sent).toEqual([]);

		service.show(
			{ type: "reaction/show", pluginName: "heart", vital: "pulse" },
			7,
		);
		sent.length = 0;
		service.replay(7);

		expect(sent).toEqual([
			[
				7,
				{
					type: "widget/show-vital",
					vital: "pulse",
					position: undefined,
					size: undefined,
				},
			],
		]);
		service.replay(8);
		expect(sent).toHaveLength(1);
	});
});
