import {
	isGesture,
	type PluginMessage,
	parseWidgetPosition,
	parseWidgetSize,
	type ServerMessage,
} from "@repo/protocol";
import { browser } from "wxt/browser";
import { queryActiveTab } from "../always/active-tab";
import { ALWAYS_OWNER, createAlwaysCamera } from "../always/always-camera";
import { holdingPluginNames } from "../always/always-hold";
import { forwardGestureToTabs } from "../always/gesture-forward";
import { createHintToaster } from "../always/hint-toast";
import {
	loadPausedTabIds,
	savePausedTabIds,
} from "../always/paused-tabs.storage";
import { createPresence } from "../always/presence.service";
import { createTabPause } from "../always/tab-pause.service";
import { createAskRunner } from "../ask/ask-runner";
import { createCameraController } from "../camera/camera-controller";
import {
	type CameraEvent,
	type CameraMaskCommand,
	isCameraEventMessage,
} from "../camera/camera-events";
import { createBrowserCameraHost } from "../camera/camera-host";
import { openCameraPermissionPage } from "../camera/camera-permission";
import {
	createCheckService,
	createConsoleLogger,
	toPageConsoleMessage,
} from "../check/check";
import type { PageConsoleMessage } from "../check/check.console";
import {
	isCheckCommand,
	isMaskCommand,
	isPopupStatusRequest,
	isWidgetReply,
	type PopupStatus,
	type SpectraUpdate,
	type WidgetMessage,
} from "../messages";
import {
	listInstalledPlugins,
	registerInstalledPlugins,
} from "../plugins/register";
import {
	loadPluginsEnabled,
	loadShowLogs,
	PLUGINS_ENABLED_KEY,
} from "../popup-settings";
import { isServerOnline } from "../server-ping";
import { listTabAddresses, sendSignalToTab } from "../signals/signal-forward";
import {
	createSignalService,
	type SignalService,
} from "../signals/signals.service";
import { resolvePluginDisplayName } from "./display-name";
import {
	createVitalShowService,
	isHideVitalMessage,
	isShowVitalMessage,
} from "./vital-show.service";

const MIN_ASK_TIMEOUT_MS = 1000;

type Sender = Parameters<
	Parameters<typeof browser.runtime.onMessage.addListener>[0]
>[1];
type SendResponse = (response?: unknown) => void;

function isAskMessage(
	message: unknown,
): message is Extract<PluginMessage, { type: "reaction/ask" }> {
	const candidate = message as Partial<
		Extract<PluginMessage, { type: "reaction/ask" }>
	> | null;
	return (
		candidate?.type === "reaction/ask" &&
		typeof candidate.question === "string" &&
		typeof candidate.pluginName === "string" &&
		typeof candidate.timeoutMs === "number" &&
		Array.isArray(candidate.options) &&
		candidate.options.every((option) => isGesture(option?.value))
	);
}

function isCancelAskMessage(
	message: unknown,
): message is Extract<PluginMessage, { type: "reaction/cancel-ask" }> {
	return (message as { type?: unknown } | null)?.type === "reaction/cancel-ask";
}

function isToastMessage(
	message: unknown,
): message is Extract<PluginMessage, { type: "reaction/toast" }> {
	const candidate = message as Partial<
		Extract<PluginMessage, { type: "reaction/toast" }>
	> | null;
	return (
		candidate?.type === "reaction/toast" && typeof candidate.text === "string"
	);
}

/** The tab of a page that sent the message; the popup, even when opened as a tab, speaks for the tab in front. */
function pageTabIdOf(sender: Sender): number | undefined {
	const isExtensionPage = sender.url?.startsWith(browser.runtime.getURL("/"));
	return isExtensionPage ? undefined : sender.tab?.id;
}

/** The popup listens only while it is open; with nobody there the send is rejected and that is fine. */
function notifyPopup(update: SpectraUpdate): void {
	browser.runtime.sendMessage(update).catch(() => {});
}

/** The page in front gets the line too: its console is the one a developer already has open. */
async function printInActiveTab(message: PageConsoleMessage): Promise<void> {
	const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
	if (tab?.id === undefined) return;
	await browser.tabs.sendMessage(tab.id, message).catch(() => {});
}

/** Wires camera, `ask` runner, the camera of always scripts and all message routes of the background. */
export function startBackground(): void {
	let showLogs = false;
	const refreshShowLogs = () =>
		void loadShowLogs().then((enabled) => {
			showLogs = enabled;
		});
	refreshShowLogs();
	browser.storage.onChanged.addListener(refreshShowLogs);

	/** The main switch of the popup. While it is off no script runs, asks, shows Beta or holds the camera. */
	let pluginsOn = true;
	void loadPluginsEnabled().then((enabled) => {
		pluginsOn = enabled;
	});
	browser.storage.onChanged.addListener((changes) => {
		const change = changes[PLUGINS_ENABLED_KEY];
		if (!change) return;
		pluginsOn = change.newValue !== false;
		registerInstalledPlugins().catch((error) =>
			console.error("[Pleiades Spectra] scripts were not registered", error),
		);
	});
	let signals: SignalService | null = null;
	/** The popup shows the face mask over its preview, so the camera page asks the server for it. */
	let maskWanted = false;
	const camera = createCameraController(
		createBrowserCameraHost({
			isDebug: () => showLogs,
			signals: () => signals?.signalsForNewSession() ?? [],
			wantsMask: () => maskWanted,
		}),
	);
	signals = createSignalService({
		listPlugins: listInstalledPlugins,
		listTabs: listTabAddresses,
		sendToTab: sendSignalToTab,
		isCameraRunning: () => camera.currentOwner() !== null,
		isAlwaysHolding: () => camera.hasOwner(ALWAYS_OWNER),
		isBusy: () => asks.isBusy() || isCheckRunning(),
		restartCamera: camera.restart,
		setTimer: (callback, ms) => setTimeout(callback, ms),
		clearTimer: (handle) =>
			clearTimeout(handle as ReturnType<typeof setTimeout>),
	});
	const signalService = signals;

	const asks = createAskRunner({
		checkServer: isServerOnline,
		sendToWidget: (tabId, message) =>
			void browser.tabs.sendMessage(tabId, message).catch(() => {}),
		camera,
		setTimer: (callback, ms) => setTimeout(callback, ms),
		clearTimer: (handle) =>
			clearTimeout(handle as ReturnType<typeof setTimeout>),
	});

	const vitalShows = createVitalShowService({
		sendToWidget: (tabId, message) =>
			void browser.tabs.sendMessage(tabId, message).catch(() => {}),
	});

	const tabPause = createTabPause({
		load: loadPausedTabIds,
		save: savePausedTabIds,
	});

	/** The always scripts that want the camera for the tab in front now. */
	const pluginsHoldingActiveTab = async () => {
		if (!pluginsOn) return { activeTab: undefined, names: [] };
		const [plugins, activeTab, pausedTabIds] = await Promise.all([
			listInstalledPlugins(),
			queryActiveTab(),
			tabPause.pausedTabIds(),
		]);
		return {
			activeTab,
			names: holdingPluginNames(plugins, activeTab, pausedTabIds),
		};
	};

	const toastInActiveTab = createHintToaster((text) => {
		void queryActiveTab().then((tab) => {
			if (tab?.id === undefined) return;
			const message: WidgetMessage = { type: "widget/toast", text };
			browser.tabs.sendMessage(tab.id, message).catch(() => {});
		});
	});

	const always = createAlwaysCamera({
		camera,
		isHoldWanted: async () =>
			(await pluginsHoldingActiveTab()).names.length > 0,
		forwardGesture: (gesture, confidence) => {
			if (isGesture(gesture))
				void forwardGestureToTabs({ gesture, confidence });
		},
		forwardHint: toastInActiveTab,
	});

	const presence = createPresence({
		sendToWidget: (tabId, message) =>
			void browser.tabs.sendMessage(tabId, message).catch(() => {}),
		isQuestionOpen: () => asks.isBusy(),
	});

	/** Beta stands on the page in front only while the camera really runs for it. */
	const publishPresence = async () => {
		const { activeTab, names } = await pluginsHoldingActiveTab();
		const isRunning = camera.hasOwner(ALWAYS_OWNER);
		presence.update(activeTab?.id ?? null, isRunning ? names : []);
	};

	const printToConsole = createConsoleLogger({
		isEnabled: () => showLogs,
		info: (line, payload) => console.log(line, payload),
		warn: (line, payload) => console.warn(line, payload),
	});

	/** A check that has started and not ended; the camera must not be restarted under it. */
	const isCheckRunning = () => {
		const { status } = check.view();
		return status === "starting" || status === "running";
	};

	const check = createCheckService({
		camera,
		checkServer: isServerOnline,
		now: () => Date.now(),
		setTimer: (callback, ms) => setTimeout(callback, ms),
		clearTimer: (handle) =>
			clearTimeout(handle as ReturnType<typeof setTimeout>),
		publishView: (view) => notifyPopup({ type: "spectra/view", view }),
		publishLog: (entry) => {
			if (!showLogs) return;
			printToConsole(entry);
			void printInActiveTab(toPageConsoleMessage(entry));
		},
	});

	const followFaceOnPage = (message: ServerMessage) => {
		if (message.type === "expression")
			presence.follow({ type: "widget/expression", scores: message.scores });
		else if (message.type === "gesture")
			presence.follow({ type: "widget/gesture", gesture: message.gesture });
	};

	const handleCameraEvent = (event: CameraEvent) => {
		check.handleCameraEvent(event);
		asks.handleCameraEvent(event);
		always.handleCameraEvent(event);
		if (event.kind === "server") followFaceOnPage(event.message);
		if (event.kind === "server" && event.message.type === "signal")
			void signalService.deliver(event.message.sample);
	};
	camera.subscribe(handleCameraEvent);

	const startAsk = (
		message: Extract<PluginMessage, { type: "reaction/ask" }>,
		sender: Sender,
		sendResponse: SendResponse,
	) => {
		const tabId = sender.tab?.id;
		if (tabId === undefined) return sendResponse("timeout");
		void listInstalledPlugins().then((plugins) => {
			const pluginName = resolvePluginDisplayName(
				plugins,
				sender,
				message.pluginName,
			);
			asks
				.ask(
					{
						pluginName,
						question: message.question,
						options: message.options,
						timeoutMs: Math.max(message.timeoutMs, MIN_ASK_TIMEOUT_MS),
						position: parseWidgetPosition(message.position),
						size: parseWidgetSize(message.size),
					},
					tabId,
				)
				.then(sendResponse);
		});
	};

	const popupStatus = async (): Promise<PopupStatus> => {
		const activeTab = await queryActiveTab();
		return {
			cameraOwner: camera.currentOwner(),
			isActiveTabPaused: activeTab
				? await tabPause.isPaused(activeTab.id)
				: false,
			check: check.view(),
		};
	};

	const answerPopupStatus = async (sendResponse: SendResponse) =>
		sendResponse(await popupStatus());

	/** The user turned the camera off: the page (or the tab in front, for the popup) gets no camera until it is reloaded. */
	const pauseCameraFor = async (tabId: number | undefined) => {
		if (!camera.hasOwner(ALWAYS_OWNER)) return;
		const target = tabId ?? (await queryActiveTab())?.id;
		if (target !== undefined) await tabPause.pause(target);
		await syncCameraAndSignals();
	};

	const handlePluginMessage = (
		message: unknown,
		sender: Sender,
		sendResponse: SendResponse,
	): boolean => {
		if (!pluginsOn) {
			if (isAskMessage(message)) sendResponse("timeout");
			return false;
		}
		if (isAskMessage(message)) {
			startAsk(message, sender, sendResponse);
			return true;
		}
		if (isCancelAskMessage(message) && sender.tab?.id !== undefined)
			asks.pageGone(sender.tab.id);
		if (isShowVitalMessage(message) && sender.tab?.id !== undefined)
			vitalShows.show(message, sender.tab.id);
		if (isHideVitalMessage(message) && sender.tab?.id !== undefined)
			vitalShows.hide(message.pluginName, sender.tab.id);
		if (isToastMessage(message) && sender.tab?.id !== undefined)
			void browser.tabs
				.sendMessage(sender.tab.id, {
					type: "widget/toast",
					text: message.text,
				})
				.catch(() => {});
		return false;
	};

	/** The signals of a session depend on whether the camera is held for always scripts, so they are looked at after it. */
	const syncCameraAndSignals = async () => {
		await always.sync();
		await signalService.refresh();
		await publishPresence();
	};

	const handleExtensionMessage = (
		message: unknown,
		sender: Sender,
		sendResponse: SendResponse,
	): boolean => {
		if (isMaskCommand(message)) {
			maskWanted = message.enabled;
			const command: CameraMaskCommand = {
				type: "camera/mask",
				enabled: maskWanted,
			};
			browser.runtime.sendMessage(command).catch(() => {});
		} else if (isCameraEventMessage(message)) {
			if (
				message.event.kind === "server" &&
				message.event.message.type === "mask"
			) {
				const { width, height, points } = message.event.message;
				notifyPopup({ type: "spectra/mask", width, height, points });
				return false;
			}
			if (
				message.event.kind === "failed" &&
				message.event.reason === "permission"
			)
				void openCameraPermissionPage();
			camera.handleEvent(message.event);
		} else if (isWidgetReply(message)) {
			if (message.type === "widget/answer") asks.answerClicked(message.value);
			else if (message.type === "widget/ready") {
				if (sender.tab?.id === undefined) return false;
				vitalShows.replay(sender.tab.id);
				presence.replay(sender.tab.id);
			} else {
				if (message.type === "widget/camera-off") asks.cameraOffClicked();
				void pauseCameraFor(pageTabIdOf(sender)).then(async () =>
					sendResponse(await popupStatus()),
				);
				return true;
			}
		} else if (isCheckCommand(message)) {
			if (message.type === "spectra/check-start") void check.start();
			else void check.stop();
		} else if (isPopupStatusRequest(message)) {
			void answerPopupStatus(sendResponse);
			return true;
		}
		return false;
	};

	/** A closed tab or a real navigation unloads the page, and the script there cannot say so itself. */
	browser.tabs.onRemoved.addListener((tabId) => {
		asks.pageGone(tabId);
		vitalShows.pageGone(tabId);
		void tabPause.resume(tabId).then(syncCameraAndSignals);
	});
	browser.tabs.onUpdated.addListener((tabId, change) => {
		if (change.status === undefined && change.url === undefined) return;
		if (change.status === "loading") {
			asks.pageGone(tabId);
			vitalShows.pageGone(tabId);
		}
		const endsPause = change.status === "loading" || change.url !== undefined;
		void (endsPause ? tabPause.resume(tabId) : Promise.resolve()).then(
			syncCameraAndSignals,
		);
	});
	browser.tabs.onActivated.addListener(() => void syncCameraAndSignals());
	browser.windows.onFocusChanged.addListener(() => void syncCameraAndSignals());

	browser.runtime.onMessage.addListener(handleExtensionMessage);
	browser.runtime.onUserScriptMessage?.addListener(handlePluginMessage);

	const syncPluginsAndCamera = () => {
		registerInstalledPlugins().catch((error) =>
			console.error("[Pleiades Spectra] scripts were not registered", error),
		);
		void syncCameraAndSignals();
	};
	browser.runtime.onInstalled.addListener(syncPluginsAndCamera);
	browser.storage.onChanged.addListener(() => void syncCameraAndSignals());
	syncPluginsAndCamera();
}
