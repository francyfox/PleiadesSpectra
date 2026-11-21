import { browser } from "wxt/browser";
import type { CameraHost } from "./camera-controller";
import type { CameraStopCommand } from "./camera-events";
import { type CameraSessionOptions, withSessionParams } from "./session-params";

const STOP_ACK_TIMEOUT_MS = 500;

function sendStopCommand(): Promise<unknown> {
	const command: CameraStopCommand = { type: "camera/stop" };
	return Promise.race([
		browser.runtime.sendMessage(command),
		new Promise((resolve) => setTimeout(resolve, STOP_ACK_TIMEOUT_MS)),
	]).catch(() => {});
}

/** Chrome: a hidden offscreen document owns the camera. */
function createOffscreenHost(options: CameraSessionOptions): CameraHost {
	return {
		async open() {
			await browser.offscreen.closeDocument().catch(() => {});
			await browser.offscreen.createDocument({
				url: withSessionParams(
					browser.runtime.getURL("/offscreen.html"),
					options,
				),
				reasons: ["USER_MEDIA"],
				justification: "Read camera frames for gesture recognition",
			});
		},
		async close() {
			await sendStopCommand();
			await browser.offscreen.closeDocument().catch(() => {});
		},
	};
}

/** Firefox has no offscreen documents: a background tab owns the camera. */
function createTabHost(options: CameraSessionOptions): CameraHost {
	let tabId: number | null = null;
	return {
		async open() {
			const tab = await browser.tabs.create({
				url: withSessionParams(browser.runtime.getURL("/camera.html"), options),
				active: false,
			});
			tabId = tab.id ?? null;
		},
		async close() {
			await sendStopCommand();
			if (tabId !== null) await browser.tabs.remove(tabId).catch(() => {});
			tabId = null;
		},
	};
}

export function createBrowserCameraHost(
	options: CameraSessionOptions,
): CameraHost {
	return import.meta.env.FIREFOX
		? createTabHost(options)
		: createOffscreenHost(options);
}
