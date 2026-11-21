import type { WidgetMessage } from "../messages";

export interface PresenceDeps {
	sendToWidget(tabId: number, message: WidgetMessage): void;
	/** A question is open: its own runner already tells the widget what the face does. */
	isQuestionOpen(): boolean;
}

export interface Presence {
	/** The tab in front and the scripts that hold the camera for it; the tab that was in front before is cleared. */
	update(tabId: number | null, plugins: readonly string[]): void;
	/** The widget of the tab has just started: it knows nothing yet, so the last list is sent again. */
	replay(tabId: number): void;
	/** Gesture or expression from the camera: Beta of the tab with presence follows the face. */
	follow(
		message: Extract<
			WidgetMessage,
			{ type: "widget/gesture" | "widget/expression" }
		>,
	): void;
}

/** Keeps Beta on the one tab the camera is held for, and tells her what the face does. */
export function createPresence(deps: PresenceDeps): Presence {
	let shownTabId: number | null = null;
	let shownPlugins: string[] = [];

	const send = (tabId: number, plugins: readonly string[]) =>
		deps.sendToWidget(tabId, {
			type: "widget/presence",
			plugins: [...plugins],
		});

	const isSameList = (plugins: readonly string[]) =>
		plugins.length === shownPlugins.length &&
		plugins.every((name, index) => name === shownPlugins[index]);

	return {
		update(tabId, plugins) {
			const nextTabId = plugins.length > 0 ? tabId : null;
			if (shownTabId !== null && shownTabId !== nextTabId) send(shownTabId, []);
			const isChanged = nextTabId !== shownTabId || !isSameList(plugins);
			if (nextTabId !== null && isChanged) send(nextTabId, plugins);
			shownTabId = nextTabId;
			shownPlugins = nextTabId === null ? [] : [...plugins];
		},
		replay(tabId) {
			if (tabId === shownTabId && shownPlugins.length > 0)
				send(tabId, shownPlugins);
		},
		follow(message) {
			if (shownTabId === null || deps.isQuestionOpen()) return;
			deps.sendToWidget(shownTabId, message);
		},
	};
}
