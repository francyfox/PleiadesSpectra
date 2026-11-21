export interface TabPauseDeps {
	load(): Promise<number[]>;
	save(tabIds: number[]): Promise<void>;
}

export interface TabPause {
	/** The camera is not held for this tab until it is reloaded, goes to another address or closes. */
	pause(tabId: number): Promise<void>;
	/** Takes the pause off; `true` when the tab was paused. */
	resume(tabId: number): Promise<boolean>;
	isPaused(tabId: number): Promise<boolean>;
	pausedTabIds(): Promise<ReadonlySet<number>>;
}

/** The pauses are kept through `deps`, so a background that the browser put to sleep does not forget them. */
export function createTabPause(deps: TabPauseDeps): TabPause {
	let loaded: Promise<Set<number>> | null = null;

	const paused = () => {
		loaded ??= deps.load().then((tabIds) => new Set(tabIds));
		return loaded;
	};

	const persist = (tabIds: Set<number>) => deps.save([...tabIds]);

	return {
		async pause(tabId) {
			const tabIds = await paused();
			if (tabIds.has(tabId)) return;
			tabIds.add(tabId);
			await persist(tabIds);
		},
		async resume(tabId) {
			const tabIds = await paused();
			if (!tabIds.delete(tabId)) return false;
			await persist(tabIds);
			return true;
		},
		async isPaused(tabId) {
			return (await paused()).has(tabId);
		},
		pausedTabIds: paused,
	};
}
