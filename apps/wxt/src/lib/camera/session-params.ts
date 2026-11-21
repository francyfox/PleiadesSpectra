import { isSignalName, type SignalName } from "@repo/protocol";

export interface CameraSessionOptions {
	isDebug(): boolean;
	/** Signals for the session that is about to open. */
	signals(): SignalName[];
	/** Whether the popup is showing the face mask now. */
	wantsMask(): boolean;
}

/** The camera page cannot read the extension's storage, so “Show logs” and the signals are handed over in the address. */
export function withSessionParams(
	url: string,
	options: CameraSessionOptions,
): string {
	const params = new URLSearchParams();
	if (options.isDebug()) params.set("debug", "1");
	if (options.wantsMask()) params.set("mask", "1");
	const signals = options.signals();
	if (signals.length > 0) params.set("signals", signals.join(","));
	const query = params.toString();
	return query ? `${url}?${query}` : url;
}

/** `?signals=pose,pulse` set by the background; unknown names are dropped. */
export function readRequestedSignals(search: string): SignalName[] {
	const list = new URLSearchParams(search).get("signals") ?? "";
	return list.split(",").filter(isSignalName);
}
