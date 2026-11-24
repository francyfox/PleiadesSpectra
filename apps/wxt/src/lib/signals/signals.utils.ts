import { type SignalName, signalNames } from "@repo/protocol";
import type { InstalledPlugin } from "../plugins/types";

const SIGNAL_LABELS: Record<SignalName, string> = {
	blink: "Blinks",
	pose: "Head pose",
	expression: "Expressions",
	pulse: "Pulse",
};

const PHYSIOLOGICAL_SIGNALS: readonly SignalName[] = ["pulse"];

export const PHYSIOLOGICAL_NOTE =
	"Physiological signal: heart rate measured from the camera; not a medical reading.";

function escapeRegExp(text: string): string {
	return text.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

function patternToRegExp(pattern: string): RegExp | null {
	const parts = /^(\*|https?|file|ftp):\/\/([^/]*)(\/.*)$/.exec(pattern);
	if (!parts) return null;
	const [, scheme = "", host = "", path = ""] = parts;
	const schemeSource = scheme === "*" ? "https?" : escapeRegExp(scheme);
	const hostSource = host.startsWith("*.")
		? `(?:[^/]+\\.)?${escapeRegExp(host.slice(2))}`
		: escapeRegExp(host).replace(/\\\*/g, "[^/]*");
	const pathSource = escapeRegExp(path).replace(/\*/g, ".*");
	/** Chrome ignores the port in a match pattern: `*://localhost/*` covers `http://localhost:4010/`. */
	const portSource = "(?::\\d+)?";
	return new RegExp(
		`^${schemeSource}://${hostSource}${portSource}${pathSource}$`,
	);
}

/** Whether a WebExtension match pattern (`*://*.example.com/*`, `<all_urls>`) covers the address. */
export function matchesUrl(pattern: string, url: string): boolean {
	if (pattern === "<all_urls>") return /^(https?|file|ftp):/.test(url);
	return patternToRegExp(pattern)?.test(url) ?? false;
}

/** Keeps the order of `signalNames`, so equal sets always look the same. */
function inCanonicalOrder(signals: ReadonlySet<SignalName>): SignalName[] {
	return signalNames.filter((name) => signals.has(name));
}

function unionOfSignals(plugins: readonly InstalledPlugin[]): SignalName[] {
	return inCanonicalOrder(
		new Set(plugins.flatMap((plugin) => plugin.header.signals ?? [])),
	);
}

/** Signals of all enabled scripts: what one camera session has to measure. */
export function signalsOfEnabledPlugins(
	plugins: readonly InstalledPlugin[],
): SignalName[] {
	return unionOfSignals(plugins.filter((plugin) => plugin.enabled));
}

/** Signals of the enabled scripts whose `@match` covers the address: what that page may receive. */
export function signalsForUrl(
	plugins: readonly InstalledPlugin[],
	url: string,
): SignalName[] {
	return unionOfSignals(
		plugins.filter(
			(plugin) =>
				plugin.enabled &&
				plugin.header.matches.some((pattern) => matchesUrl(pattern, url)),
		),
	);
}

export function sameSignals(
	first: readonly SignalName[],
	second: readonly SignalName[],
): boolean {
	return (
		first.length === second.length &&
		first.every((name) => second.includes(name))
	);
}

export function signalLabel(name: SignalName): string {
	return SIGNAL_LABELS[name];
}

export function signalLabels(signals: readonly SignalName[]): string[] {
	return signals.map(signalLabel);
}

/** The warning the install window and the list show for `pulse`; empty for the rest. */
export function physiologicalNote(signals: readonly SignalName[]): string {
	return signals.some((name) => PHYSIOLOGICAL_SIGNALS.includes(name))
		? PHYSIOLOGICAL_NOTE
		: "";
}
