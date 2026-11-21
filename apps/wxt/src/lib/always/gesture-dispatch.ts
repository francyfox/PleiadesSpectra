import { GESTURE_EVENT_NAME } from "@repo/protocol";
import { browser } from "wxt/browser";
import { isGestureForwardMessage } from "../messages";

/**
 * Content script side: re-emits forwarded gestures as a DOM event the scripts listen to.
 * `detail` stays a JSON string because objects do not cross extension worlds.
 */
export function listenForForwardedGestures(): void {
	browser.runtime.onMessage.addListener((message) => {
		if (!isGestureForwardMessage(message)) return;
		window.dispatchEvent(
			new CustomEvent(GESTURE_EVENT_NAME, { detail: message.detail }),
		);
	});
}
