import { SIGNAL_EVENT_NAME, type SignalSample } from "@repo/protocol";
import { browser } from "wxt/browser";
import { isSignalForwardMessage, type WidgetMessage } from "../messages";
import { publishWidgetMessage } from "../widget-bus";

/** What the widget shows of a forwarded sample: Beta spins a pinwheel for breathing and shows a heart for the pulse. */
function widgetMessageFor(detail: string): WidgetMessage | undefined {
	try {
		const sample = JSON.parse(detail) as SignalSample;
		if (sample.signal === "breathing")
			return {
				type: "widget/breathing",
				rate: (sample as SignalSample<"breathing">).value.rate,
			};
		if (sample.signal === "pulse") {
			const { bpm, stable } = (sample as SignalSample<"pulse">).value;
			return { type: "widget/pulse", bpm, stable };
		}
	} catch {
		return undefined;
	}
	return undefined;
}

/**
 * Content script side: re-emits forwarded signals as a DOM event the scripts listen to.
 * `detail` stays a JSON string because objects do not cross extension worlds.
 */
export function listenForForwardedSignals(): void {
	browser.runtime.onMessage.addListener((message) => {
		if (!isSignalForwardMessage(message)) return;
		window.dispatchEvent(
			new CustomEvent(SIGNAL_EVENT_NAME, { detail: message.detail }),
		);
		const widgetMessage = widgetMessageFor(message.detail);
		if (widgetMessage) publishWidgetMessage(widgetMessage);
	});
}
