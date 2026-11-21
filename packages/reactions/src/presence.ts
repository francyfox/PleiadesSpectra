import type { VitalName } from "@repo/protocol";
import type { RuntimeEnvironment } from "./environment";
import type { ShowOptions } from "./types";

/** Whether Beta stands on the page because of this reaction, and how to put it there and take it away. */
export interface Presence {
	show: (vital: VitalName, options?: ShowOptions) => void;
	/** Takes Beta away if this reaction showed it; does nothing (and sends nothing) otherwise. */
	hide: () => void;
}

/**
 * One presence per started reaction: the show outlives the handler that asked for it, so it is shared by every
 * run and every subscription of the reaction and is removed by `hide` or, at the latest, when the reaction stops.
 */
export function createPresence(
	pluginName: string,
	environment: RuntimeEnvironment,
): Presence {
	let isShown = false;

	const show = (vital: VitalName, options?: ShowOptions): void => {
		isShown = true;
		environment
			.transport({
				type: "reaction/show",
				pluginName,
				vital,
				position: options?.position,
				size: options?.size,
			})
			.catch(() => {});
	};

	const hide = (): void => {
		if (!isShown) return;
		isShown = false;
		environment
			.transport({ type: "reaction/hide", pluginName })
			.catch(() => {});
	};

	return { show, hide };
}
