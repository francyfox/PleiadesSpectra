import type { PluginHeader } from "@repo/protocol";
import type { InstalledPlugin } from "./types";

const ALL_URLS = "<all_urls>";
/** `<all_urls>` also covers file and ftp, which `*` does not. */
const ANY_SCHEME = "<any>";
const WEB_SCHEMES = ["http", "https"];
const PATTERN_FORMAT = /^([^:/]+):\/\/([^/]*)(\/.*)$/;

interface ParsedPattern {
	scheme: string;
	host: string;
	path: string;
}

/** Why two scripts on shared pages can disturb each other. */
export interface PluginOverlap {
	/** Names of the other enabled scripts that run on a page this script also runs on. */
	sharesWith: string[];
	/** Concrete conflicts only: shared gestures, signals and two always-on cameras. */
	warnings: string[];
}

/** Parses a match pattern; `null` for a shape that is not understood, which callers treat as "may overlap". */
function parsePattern(pattern: string): ParsedPattern | null {
	if (pattern === ALL_URLS)
		return { scheme: ANY_SCHEME, host: "*", path: "/*" };
	const parts = PATTERN_FORMAT.exec(pattern);
	if (!parts) return null;
	const [, scheme = "", host = "", path = "/*"] = parts;
	return { scheme, host, path };
}

/** Whether two strings in which `*` means "any substring" can both match one string. */
export function globsIntersect(first: string, second: string): boolean {
	const memo = new Map<number, boolean>();

	function walk(i: number, j: number): boolean {
		const key = i * (second.length + 1) + j;
		const known = memo.get(key);
		if (known !== undefined) return known;
		const result = step(i, j);
		memo.set(key, result);
		return result;
	}

	function step(i: number, j: number): boolean {
		if (i === first.length && j === second.length) return true;
		if (
			first[i] === "*" &&
			(walk(i + 1, j) || (j < second.length && walk(i, j + 1)))
		)
			return true;
		if (
			second[j] === "*" &&
			(walk(i, j + 1) || (i < first.length && walk(i + 1, j)))
		)
			return true;
		if (i === first.length || j === second.length) return false;
		return first[i] === second[j] && walk(i + 1, j + 1);
	}

	return walk(0, 0);
}

function schemesOverlap(first: string, second: string): boolean {
	if (first === second) return true;
	if (first === ANY_SCHEME || second === ANY_SCHEME) return true;
	if (first === "*") return WEB_SCHEMES.includes(second);
	if (second === "*") return WEB_SCHEMES.includes(first);
	return false;
}

/** `*.example.com` covers `example.com` and every subdomain, so it is two globs. */
function hostGlobs(host: string): string[] {
	if (host.startsWith("*.")) return [host.slice(2), host];
	return [host];
}

function hostsOverlap(first: string, second: string): boolean {
	return hostGlobs(first.toLowerCase()).some((left) =>
		hostGlobs(second.toLowerCase()).some((right) =>
			globsIntersect(left, right),
		),
	);
}

/**
 * Whether one URL can match both match patterns. Exact for the usual shapes; a pattern that cannot be parsed
 * counts as overlapping, because a missed conflict is worse than a spurious one.
 */
export function patternsOverlap(first: string, second: string): boolean {
	const left = parsePattern(first);
	const right = parsePattern(second);
	if (!left || !right) return true;
	return (
		schemesOverlap(left.scheme, right.scheme) &&
		hostsOverlap(left.host, right.host) &&
		globsIntersect(left.path, right.path)
	);
}

export function headersShareAPage(
	first: PluginHeader,
	second: PluginHeader,
): boolean {
	return first.matches.some((left) =>
		second.matches.some((right) => patternsOverlap(left, right)),
	);
}

function sharedItems<T>(first: T[], second: T[]): T[] {
	return first.filter((item) => second.includes(item));
}

/** The concrete conflicts between two scripts; the pages they share are checked separately. */
export function conflictWarnings(
	first: PluginHeader,
	second: PluginHeader,
): string[] {
	const warnings: string[] = [];
	const gestures = sharedItems(first.gestures, second.gestures);
	if (gestures.length > 0)
		warnings.push(`Both listen for: ${gestures.join(", ")}. Both will react.`);
	if (first.camera === "always" && second.camera === "always")
		warnings.push("Both keep the camera always on.");
	const signals = sharedItems(first.signals, second.signals);
	if (signals.length > 0)
		warnings.push(`Both read the same signals: ${signals.join(", ")}.`);
	return warnings;
}

/** With several neighbours each warning says who it is about. */
function labelWarnings(name: string, warnings: string[], several: boolean) {
	return several ? warnings.map((warning) => `${name}: ${warning}`) : warnings;
}

/** How a script with this header overlaps the given scripts; they are expected to be enabled ones. */
export function overlapWith(
	header: PluginHeader,
	others: InstalledPlugin[],
): PluginOverlap {
	const neighbours = others.filter((other) =>
		headersShareAPage(header, other.header),
	);
	const several = neighbours.length > 1;
	return {
		sharesWith: neighbours.map((other) => other.header.name),
		warnings: neighbours.flatMap((other) =>
			labelWarnings(
				other.header.name,
				conflictWarnings(header, other.header),
				several,
			),
		),
	};
}

/** For every enabled script that shares pages with another enabled one: who, and what may clash. Disabled scripts are ignored. */
export function findOverlaps(
	plugins: InstalledPlugin[],
): Map<string, PluginOverlap> {
	const enabled = plugins.filter((plugin) => plugin.enabled);
	const overlaps = new Map<string, PluginOverlap>();
	for (const plugin of enabled) {
		const others = enabled.filter((other) => other.id !== plugin.id);
		const overlap = overlapWith(plugin.header, others);
		if (overlap.sharesWith.length > 0) overlaps.set(plugin.id, overlap);
	}
	return overlaps;
}
