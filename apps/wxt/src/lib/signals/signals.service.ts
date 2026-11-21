import type { SignalName, SignalSample } from "@repo/protocol";
import type { InstalledPlugin } from "../plugins/types";
import {
	sameSignals,
	signalsForUrl,
	signalsOfEnabledPlugins,
} from "./signals.utils";

export const SIGNAL_RESTART_DEBOUNCE_MS = 1500;

/** Samples come up to 25 times a second; the list of tabs changes far less often, so it is read once per this time. */
export const TAB_LIST_CACHE_MS = 1000;

export interface TabAddress {
	id: number;
	url: string;
}

export interface SignalServiceDeps {
	listPlugins(): Promise<InstalledPlugin[]>;
	listTabs(): Promise<TabAddress[]>;
	sendToTab(tabId: number, sample: SignalSample): void;
	isCameraRunning(): boolean;
	/**
	 * Signals belong to the always owner: they are measured only while it holds the camera. A question or a check
	 * that opens the camera alone gets a session without them, so a script cannot change what another one sees.
	 */
	isAlwaysHolding(): boolean;
	/** A question is open or a check runs: the camera must not be closed under it. */
	isBusy(): boolean;
	restartCamera(): Promise<void>;
	setTimer(callback: () => void, ms: number): unknown;
	clearTimer(handle: unknown): void;
	debounceMs?: number;
}

export interface SignalService {
	/** Reloads the scripts; restarts the running session once the wanted set stays different for a while. */
	refresh(): Promise<void>;
	/** What the camera page asks the server for; called each time a session opens. */
	signalsForNewSession(): SignalName[];
	/** Hands the sample to the tabs whose scripts declared the signal. */
	deliver(sample: SignalSample): Promise<void>;
}

/** Picks the signals of a session (all enabled scripts) and delivers samples per page (`@match`). */
export function createSignalService(deps: SignalServiceDeps): SignalService {
	let plugins: InstalledPlugin[] = [];
	let sessionSignals: SignalName[] = [];
	let pendingRestart: unknown = null;
	let tabList: Promise<TabAddress[]> | null = null;

	const wantedSignals = () =>
		deps.isAlwaysHolding() ? signalsOfEnabledPlugins(plugins) : [];

	const cancelRestart = () => {
		if (pendingRestart === null) return;
		deps.clearTimer(pendingRestart);
		pendingRestart = null;
	};

	const listTabsCached = () => {
		if (tabList) return tabList;
		tabList = deps.listTabs();
		deps.setTimer(() => {
			tabList = null;
		}, TAB_LIST_CACHE_MS);
		return tabList;
	};

	const restartIfStillNeeded = () => {
		pendingRestart = null;
		if (!deps.isCameraRunning()) return;
		if (sameSignals(wantedSignals(), sessionSignals)) return;
		if (deps.isBusy()) return scheduleRestart();
		void deps.restartCamera().catch(() => {});
	};

	const scheduleRestart = () => {
		cancelRestart();
		pendingRestart = deps.setTimer(
			restartIfStillNeeded,
			deps.debounceMs ?? SIGNAL_RESTART_DEBOUNCE_MS,
		);
	};

	return {
		async refresh() {
			plugins = await deps.listPlugins();
			const needsRestart =
				deps.isCameraRunning() && !sameSignals(wantedSignals(), sessionSignals);
			if (needsRestart) scheduleRestart();
			else cancelRestart();
		},
		signalsForNewSession() {
			sessionSignals = wantedSignals();
			return sessionSignals;
		},
		async deliver(sample) {
			if (!wantedSignals().includes(sample.signal)) return;
			for (const tab of await listTabsCached())
				if (signalsForUrl(plugins, tab.url).includes(sample.signal))
					deps.sendToTab(tab.id, sample);
		},
	};
}
