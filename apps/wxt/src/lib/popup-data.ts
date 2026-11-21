import { browser } from "wxt/browser";
import { Alpine, refsOf } from "./alpine";
import { classifyCameraError } from "./camera/camera-error";
import {
	type CameraPermission,
	openCameraPermissionPage,
	queryCameraPermission,
} from "./camera/camera-permission";
import type { CheckView } from "./check/check";
import { startPreview, stopPreview } from "./check/check.preview";
import { createIdleCheckState, toCheckView } from "./check/check.utils";
import { SDK_MIN_FPS, startFpsMeter } from "./check/fps-meter";
import { clearMask, drawMask } from "./check/mask-overlay";
import {
	browPathFor,
	browStyleFor,
	dimpleStyleFor,
	mouthPathFor,
	mouthStyleFor,
	tintStyleFor,
} from "./emotion";
import { type FaceMask, isSpectraUpdate, type PopupStatus } from "./messages";
import { AGENT_DIALOG_HASH, openPluginsPage } from "./open-plugins-page";
import { countPlugins } from "./plugins/plugin-counts";
import { isUserScriptsAvailable } from "./plugins/register";
import { listStoredPlugins } from "./plugins/store";
import {
	loadPluginsEnabled,
	loadShowLogs,
	savePluginsEnabled,
	saveShowLogs,
} from "./popup-settings";
import { isServerOnline } from "./server-ping";

/** The camera owner comes from the background, the script counts from the storage. */
interface PopupState {
	serverOnline: boolean;
	cameraOwner: string | null;
	/** The tab in front is paused for always scripts: the camera stays off there until it is reloaded. */
	isActiveTabPaused: boolean;
	activePlugins: number;
	disabledPlugins: number;
	check: CheckView;
	showLogs: boolean;
	pluginsEnabled: boolean;
	cameraPermission: CameraPermission;
	/** The permission is read after the popup opens; until then the camera block says nothing. */
	isPermissionChecked: boolean;
	isPreviewOn: boolean;
	/** Frames per second the preview really shows; 0 until the first second has passed. */
	previewFps: number;
	/** The face mask is drawn over the preview while Spectra sends it. */
	isMaskOn: boolean;
	/** The browser says the camera is allowed, but the picture did not start: the camera is busy or the grant is gone. */
	isPreviewFailed: boolean;
	/** Why the picture did not start, in the words of `classifyCameraError`. */
	previewProblem: string;
	userScriptsAvailable: boolean;
}

const IS_FIREFOX = import.meta.env.FIREFOX;

function createInitialState(): PopupState {
	return {
		serverOnline: false,
		cameraOwner: null,
		isActiveTabPaused: false,
		activePlugins: 0,
		disabledPlugins: 0,
		check: toCheckView(createIdleCheckState()),
		showLogs: false,
		pluginsEnabled: true,
		cameraPermission: "unknown",
		isPermissionChecked: false,
		isPreviewOn: false,
		previewFps: 0,
		isMaskOn: true,
		isPreviewFailed: false,
		previewProblem: "",
		userScriptsAvailable: true,
	};
}

async function requestStatus(): Promise<PopupStatus | null> {
	try {
		return await browser.runtime.sendMessage({ type: "popup/get-status" });
	} catch {
		return null;
	}
}

/** Tells the background whether the popup shows the face mask, so the server sends it only then. */
function sendMaskCommand(enabled: boolean) {
	browser.runtime.sendMessage({ type: "popup/mask", enabled }).catch(() => {});
}

function sendCheckCommand(type: "spectra/check-start" | "spectra/check-stop") {
	browser.runtime.sendMessage({ type }).catch(() => {});
}

/** Alpine CSP: the template only reads these getters and calls these methods. */
function createPopupData() {
	let previewStream: MediaStream | null = null;
	let stopFpsMeter: () => void = () => {};

	return {
		state: createInitialState(),

		get serverTone() {
			return this.state.serverOnline ? "live" : "off";
		},
		get serverText() {
			return this.state.serverOnline ? "online" : "offline";
		},
		get cameraTone() {
			return this.state.cameraOwner ? "live" : "off";
		},
		/** Said only while the camera works; a camera that is off needs no words. */
		get cameraText() {
			const owner = this.state.cameraOwner;
			return owner ? `On, used by “${owner}”` : "Preview only: nothing is sent";
		},
		get needsUserScripts() {
			return !this.state.userScriptsAvailable;
		},
		get maskChecked() {
			return String(this.state.isMaskOn);
		},
		get fpsText() {
			return this.state.previewFps > 0
				? `${this.state.previewFps} fps`
				: "… fps";
		},
		/** `danger` below what the SDK needs, so a weak camera or a dim room is seen before a script fails. */
		get fpsTone() {
			const fps = this.state.previewFps;
			return fps > 0 && fps < SDK_MIN_FPS ? "danger" : "ok";
		},
		get isPreviewOn() {
			return this.state.isPreviewOn;
		},
		/**
		 * Without the permission the popup asks for it, also where the browser cannot tell (`unknown`) and where the
		 * grant does not give a picture; a camera that cannot be used must never leave the popup silent.
		 */
		get needsCameraPermission() {
			const { cameraOwner, cameraPermission, isPermissionChecked } = this.state;
			if (!isPermissionChecked || cameraOwner !== null) return false;
			return cameraPermission !== "granted" || this.state.isPreviewFailed;
		},
		/** The same picture as the widget, but the popup never shows a pose: Beta only follows the check. */
		get baseStyle() {
			return "opacity: 1";
		},
		get overlayStyle() {
			return "opacity: 1";
		},
		get poseStyle() {
			return "opacity: 0";
		},
		get showCameraText() {
			return this.state.cameraOwner !== null || this.state.isPreviewOn;
		},
		/** The reason the browser gave, so that a camera that does not open is not a riddle. */
		get cameraProblem() {
			return this.state.previewProblem;
		},
		get hasCameraProblem() {
			return this.needsCameraPermission && this.state.previewProblem !== "";
		},
		get hasCameraBlock() {
			return (
				this.showCameraText ||
				this.needsCameraPermission ||
				this.isCameraOn ||
				this.isPausedHere
			);
		},
		get isCameraOn() {
			return this.state.cameraOwner !== null;
		},
		get isPausedHere() {
			return this.state.isActiveTabPaused && !this.isCameraOn;
		},
		get activePluginsText() {
			return String(this.state.activePlugins);
		},
		get disabledPluginsText() {
			return String(this.state.disabledPlugins);
		},

		get isChecking() {
			return (
				this.state.check.status === "starting" ||
				this.state.check.status === "running"
			);
		},
		get checkButtonText() {
			return this.isChecking ? "Stop check" : "Spectra check";
		},
		/** The emotion while a check runs; otherwise what the check is doing (idle, starting, blocked). */
		get emotionStatus() {
			const { status, emotion } = this.state.check;
			return status === "running" ? emotion : status;
		},
		get emotionLabel() {
			return this.checkLabel;
		},
		get mouthPath() {
			return mouthPathFor(this.state.check.emotion);
		},
		get mouthStyle() {
			return mouthStyleFor(this.state.check.emotion);
		},
		get browPath() {
			return browPathFor(this.state.check.emotion);
		},
		get dimpleStyle() {
			return dimpleStyleFor(this.state.check.emotion);
		},
		get tintStyle() {
			return tintStyleFor(this.state.check.emotion);
		},
		get browStyle() {
			return browStyleFor(this.state.check.emotion);
		},
		get checkBetaClass() {
			return `popup__beta popup__beta--${this.state.check.status}`;
		},
		get checkLabel() {
			const { status, reason } = this.state.check;
			return status === "blocked" ? `Blocked: ${reason}` : `Spectra: ${status}`;
		},
		get checkNote() {
			const { reason, hint } = this.state.check;
			return reason || hint;
		},
		get hasCheckNote() {
			return this.checkNote !== "";
		},
		get pluginsEnabledChecked() {
			return String(this.state.pluginsEnabled);
		},
		get pluginsOff() {
			return !this.state.pluginsEnabled;
		},
		get showLogsChecked() {
			return String(this.state.showLogs);
		},

		async init() {
			const [online, status] = await Promise.all([
				isServerOnline(),
				requestStatus(),
			]);
			this.state.serverOnline = online;
			this.applyStatus(status);
			const counts = countPlugins(await listStoredPlugins());
			this.state.activePlugins = counts.active;
			this.state.disabledPlugins = counts.disabled;
			if (status) this.state.check = status.check;
			this.state.userScriptsAvailable = await isUserScriptsAvailable();
			this.state.showLogs = await loadShowLogs();
			this.state.pluginsEnabled = await loadPluginsEnabled();
			this.state.cameraPermission = await queryCameraPermission();
			this.state.isPermissionChecked = true;
			if (this.state.cameraPermission === "granted") void this.showPreview();
			browser.runtime.onMessage.addListener((message: unknown) =>
				this.handleUpdate(message),
			);
			window.addEventListener("pagehide", () => this.leave());
		},
		applyStatus(status: PopupStatus | null) {
			this.state.cameraOwner = status?.cameraOwner ?? null;
			this.state.isActiveTabPaused = status?.isActiveTabPaused ?? false;
		},
		handleUpdate(message: unknown) {
			if (!isSpectraUpdate(message)) return;
			if (message.type === "spectra/mask") {
				this.drawFaceMask(message);
				return;
			}
			this.state.check = message.view;
		},
		/** Closing the popup must not leave the camera on: the preview and a running check both stop. */
		leave() {
			this.hidePreview();
			if (this.isChecking) sendCheckCommand("spectra/check-stop");
		},
		async toggleCheck() {
			if (this.isChecking) {
				sendCheckCommand("spectra/check-stop");
				return;
			}
			sendCheckCommand("spectra/check-start");
			if (!this.state.isPreviewOn) await this.showPreview();
		},
		/** Your own picture, drawn here only: no frame goes anywhere until a check starts. */
		async showPreview() {
			const video = refsOf(this).preview as HTMLVideoElement | undefined;
			if (!video) return;
			this.state.previewProblem = "";
			previewStream = await startPreview(video, (error) => {
				this.state.previewProblem = classifyCameraError(error).message;
			});
			this.state.isPreviewOn = previewStream !== null;
			this.state.isPreviewFailed = previewStream === null;
			if (previewStream) sendMaskCommand(this.state.isMaskOn);
			if (previewStream)
				stopFpsMeter = startFpsMeter(video, (fps) => {
					this.state.previewFps = fps;
				});
		},
		hidePreview() {
			const video = refsOf(this).preview as HTMLVideoElement | undefined;
			stopFpsMeter();
			sendMaskCommand(false);
			this.clearFaceMask();
			stopPreview(video, previewStream);
			previewStream = null;
			this.state.isPreviewOn = false;
			this.state.previewFps = 0;
		},
		/** The mask is Spectra's own result: the landmarks of the face it found, over your picture, drawn here only. */
		drawFaceMask(mask: FaceMask) {
			const canvas = refsOf(this).mask as HTMLCanvasElement | undefined;
			if (canvas && this.state.isMaskOn && this.state.isPreviewOn)
				drawMask(canvas, mask);
		},
		clearFaceMask() {
			const canvas = refsOf(this).mask as HTMLCanvasElement | undefined;
			if (canvas) clearMask(canvas);
		},
		toggleMask() {
			this.state.isMaskOn = !this.state.isMaskOn;
			sendMaskCommand(this.state.isMaskOn && this.state.isPreviewOn);
			if (!this.state.isMaskOn) this.clearFaceMask();
		},
		/** The main switch: the background watches the storage and registers or drops the scripts by it. */
		async togglePlugins() {
			this.state.pluginsEnabled = !this.state.pluginsEnabled;
			await savePluginsEnabled(this.state.pluginsEnabled);
		},
		async toggleLogs() {
			this.state.showLogs = !this.state.showLogs;
			await saveShowLogs(this.state.showLogs);
		},

		/** The camera of an always script is paused for the tab in front; the background answers with the new status. */
		async turnOffCamera() {
			this.state.cameraOwner = null;
			const status = await browser.runtime
				.sendMessage({ type: "widget/camera-off" })
				.catch(() => null);
			this.applyStatus(status as PopupStatus | null);
		},
		/** Chrome keeps the switch on the extension's own page; Firefox asks for the permission right here. */
		async allowUserScripts() {
			if (IS_FIREFOX) {
				await browser.permissions.request({ permissions: ["userScripts"] });
				this.state.userScriptsAvailable = await isUserScriptsAvailable();
				return;
			}
			await browser.tabs.create({
				url: `chrome://extensions/?id=${browser.runtime.id}`,
			});
		},
		allowCamera() {
			void openCameraPermissionPage();
		},
		openPlugins() {
			void openPluginsPage();
		},
		openAgent() {
			void openPluginsPage(AGENT_DIALOG_HASH);
		},
	};
}

export function registerPopupData(): void {
	Alpine.data("popup", createPopupData);
}
