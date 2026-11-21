import { browser } from "wxt/browser";
import { CAPTURE_CONSTRAINTS } from "./camera-stream";

export type CameraPermission = "granted" | "prompt" | "denied" | "unknown";

/** `unknown` where the browser cannot tell (Firefox has no `camera` permission query). */
export async function queryCameraPermission(): Promise<CameraPermission> {
	try {
		const status = await navigator.permissions.query({
			name: "camera" as PermissionName,
		});
		return status.state;
	} catch {
		return "unknown";
	}
}

/** The prompt cannot be shown from a popup or a hidden document, so it lives on a page of its own. */
export async function openCameraPermissionPage(): Promise<void> {
	await browser.tabs
		.create({ url: browser.runtime.getURL("/camera-permission.html") })
		.catch(() => {});
}

/** Asks the browser for the camera once; the grant is remembered for the extension origin. */
export async function requestCameraPermission(): Promise<boolean> {
	try {
		const stream =
			await navigator.mediaDevices.getUserMedia(CAPTURE_CONSTRAINTS);
		for (const track of stream.getTracks()) track.stop();
		return true;
	} catch {
		return false;
	}
}
