import {
	isVitalName,
	type PluginMessage,
	parseWidgetPosition,
	parseWidgetSize,
	type VitalName,
	type WidgetPosition,
	type WidgetSize,
} from "@repo/protocol";
import type { WidgetMessage } from "../messages";

export type ShowVitalMessage = Extract<
	PluginMessage,
	{ type: "reaction/show" }
>;
export type HideVitalMessage = Extract<
	PluginMessage,
	{ type: "reaction/hide" }
>;

interface VitalShow {
	pluginName: string;
	tabId: number;
	vital: VitalName;
	position?: WidgetPosition;
	size?: WidgetSize;
}

export interface VitalShowDeps {
	sendToWidget(tabId: number, message: WidgetMessage): void;
}

export interface VitalShowService {
	/** A script shows a measurement; its earlier show is replaced, and the widget of the tab follows the newest one. */
	show(message: ShowVitalMessage, tabId: number): void;
	/** A script takes Beta away; if another script of the tab still shows a measurement, the widget goes back to it. */
	hide(pluginName: string, tabId: number): void;
	/**
	 * The widget of the tab has started listening. A script shows a measurement as soon as the page loads, which can
	 * be before the widget is there, so the newest show of the tab is sent again.
	 */
	replay(tabId: number): void;
	/** The tab closed or navigated: the widget is gone with the page, so there is nothing to send. */
	pageGone(tabId: number): void;
}

export function isShowVitalMessage(
	message: unknown,
): message is ShowVitalMessage {
	const candidate = message as Partial<ShowVitalMessage> | null;
	return (
		candidate?.type === "reaction/show" &&
		typeof candidate.pluginName === "string" &&
		isVitalName(candidate.vital)
	);
}

export function isHideVitalMessage(
	message: unknown,
): message is HideVitalMessage {
	const candidate = message as Partial<HideVitalMessage> | null;
	return (
		candidate?.type === "reaction/hide" &&
		typeof candidate.pluginName === "string"
	);
}

/** The widget message for one show; `position` and `size` are checked the same way as for a question. */
export function widgetMessageForShow(
	show: Pick<VitalShow, "vital" | "position" | "size">,
): WidgetMessage {
	return {
		type: "widget/show-vital",
		vital: show.vital,
		position: parseWidgetPosition(show.position),
		size: parseWidgetSize(show.size),
	};
}

/** Remembers who shows what per tab, because several scripts may ask for Beta but the widget has one place. */
export function createVitalShowService(deps: VitalShowDeps): VitalShowService {
	let shows: VitalShow[] = [];

	const newestOfTab = (tabId: number) =>
		shows.filter((show) => show.tabId === tabId).at(-1);

	return {
		show(message, tabId) {
			const show: VitalShow = {
				pluginName: message.pluginName,
				tabId,
				vital: message.vital,
				position: message.position,
				size: message.size,
			};
			shows = [
				...shows.filter(
					(other) =>
						other.tabId !== tabId || other.pluginName !== message.pluginName,
				),
				show,
			];
			deps.sendToWidget(tabId, widgetMessageForShow(show));
		},
		hide(pluginName, tabId) {
			shows = shows.filter(
				(show) => show.tabId !== tabId || show.pluginName !== pluginName,
			);
			const remaining = newestOfTab(tabId);
			deps.sendToWidget(
				tabId,
				remaining
					? widgetMessageForShow(remaining)
					: { type: "widget/hide-vital" },
			);
		},
		replay(tabId) {
			const newest = newestOfTab(tabId);
			if (newest) deps.sendToWidget(tabId, widgetMessageForShow(newest));
		},
		pageGone(tabId) {
			shows = shows.filter((show) => show.tabId !== tabId);
		},
	};
}
