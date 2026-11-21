import type { Gesture, SignalName } from "@repo/protocol";
import type { RuntimeEnvironment } from "./environment";

/** What the script declared in its header; the extension writes it into the script's world before the runtime. */
export interface PluginPermissions {
	signals: readonly SignalName[];
	gestures: readonly Gesture[];
}

/** The global the extension defines in the world of one script. */
export const PERMISSIONS_GLOBAL_NAME = "__pleiadesPermissions";

const warnedByWindow = new WeakMap<object, Set<string>>();

/** Without a config (tests, a manual run) there is no filter and everything is allowed. */
export function readPagePermissions(
	globals: object,
): PluginPermissions | undefined {
	const value = (globals as Record<string, unknown>)[PERMISSIONS_GLOBAL_NAME];
	if (typeof value !== "object" || value === null) return undefined;
	const { signals, gestures } = value as Partial<PluginPermissions>;
	if (!Array.isArray(signals) || !Array.isArray(gestures)) return undefined;
	return { signals, gestures };
}

export function isSignalAllowed(
	environment: RuntimeEnvironment,
	signal: SignalName,
): boolean {
	return (
		!environment.permissions || environment.permissions.signals.includes(signal)
	);
}

export function isGestureAllowed(
	environment: RuntimeEnvironment,
	gesture: Gesture,
): boolean {
	return (
		!environment.permissions ||
		environment.permissions.gestures.includes(gesture)
	);
}

/** Prints `message` once per page and key. */
function warnOnce(
	environment: RuntimeEnvironment,
	key: string,
	message: string,
): void {
	const warned = warnedByWindow.get(environment.window) ?? new Set<string>();
	warnedByWindow.set(environment.window, warned);
	if (warned.has(key)) return;
	warned.add(key);
	console.warn(message);
}

export function warnSignalNotDeclared(
	environment: RuntimeEnvironment,
	signal: SignalName,
): void {
	warnOnce(
		environment,
		`signal:${signal}`,
		`[Pleiades Spectra] signal "${signal}" is not declared in @signals, so this script does not get it`,
	);
}

export function warnGestureNotDeclared(
	environment: RuntimeEnvironment,
	gesture: Gesture,
): void {
	warnOnce(
		environment,
		`gesture:${gesture}`,
		`[Pleiades Spectra] gesture "${gesture}" is not declared in @gestures, so this script does not get it`,
	);
}

/** Returns whether the signal may be used, warning once if it may not. */
export function checkSignal(
	environment: RuntimeEnvironment,
	signal: SignalName,
): boolean {
	const isAllowed = isSignalAllowed(environment, signal);
	if (!isAllowed) warnSignalNotDeclared(environment, signal);
	return isAllowed;
}

/** Returns whether the gesture may be used, warning once if it may not. */
export function checkGesture(
	environment: RuntimeEnvironment,
	gesture: Gesture,
): boolean {
	const isAllowed = isGestureAllowed(environment, gesture);
	if (!isAllowed) warnGestureNotDeclared(environment, gesture);
	return isAllowed;
}
