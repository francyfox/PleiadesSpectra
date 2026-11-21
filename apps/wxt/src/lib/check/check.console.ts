import type { LogLevel, SpectraLogEntry } from "./check.model";

export interface ConsoleLoggerDeps {
	isEnabled(): boolean;
	info(line: string, payload?: unknown): void;
	warn(line: string, payload?: unknown): void;
}

function clock(timestampMs: number): string {
	return new Date(timestampMs).toLocaleTimeString([], { hour12: false });
}

export function formatConsoleLine(entry: SpectraLogEntry): string {
	return `[Spectra] ${clock(entry.at)}  ${entry.text}`;
}

/** Prints what Spectra sends back to the console while “Show logs” is on; failures come out as warnings. */
export function createConsoleLogger(deps: ConsoleLoggerDeps) {
	return (entry: SpectraLogEntry): void => {
		if (!deps.isEnabled()) return;
		const line = formatConsoleLine(entry);
		if (entry.level === "error") deps.warn(line, entry.payload);
		else deps.info(line, entry.payload);
	};
}

/** Background → the page in front: the same line, so it shows in the console the developer already has open. */
export interface PageConsoleMessage {
	type: "spectra/console";
	level: LogLevel;
	line: string;
	payload?: unknown;
}

export function isPageConsoleMessage(
	value: unknown,
): value is PageConsoleMessage {
	return (value as { type?: unknown } | null)?.type === "spectra/console";
}

export function toPageConsoleMessage(
	entry: SpectraLogEntry,
): PageConsoleMessage {
	return {
		type: "spectra/console",
		level: entry.level,
		line: formatConsoleLine(entry),
		payload: entry.payload,
	};
}
