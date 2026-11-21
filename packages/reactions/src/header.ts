import {
	type CameraMode,
	type Gesture,
	gestures,
	isGesture,
	isSignalName,
	type PluginHeader,
	type SignalName,
	signalNames,
} from "@repo/protocol";

export type ParseHeaderResult =
	| { ok: true; header: PluginHeader }
	| { ok: false; error: string };

const HEADER_START = /^\s*\/\/\s*==Reaction==\s*$/;
const HEADER_END = /^\s*\/\/\s*==\/Reaction==\s*$/;
const HEADER_LINE = /^\s*\/\/\s*(?:@(\w+)\s*(.*?))?\s*$/;
const MATCH_PATTERN = /^(\*|https?|ftp|file):\/\/(\*|\*\.[^/*]+|[^/*]+)?\/.*$/;

const SINGLE_VALUE_FIELDS = ["name", "author", "camera"] as const;
const LIST_FIELDS = ["match", "gestures", "signals"] as const;
const KNOWN_FIELDS: readonly string[] = [
	...SINGLE_VALUE_FIELDS,
	...LIST_FIELDS,
];

const CAMERA_MODES: readonly CameraMode[] = ["on-demand", "always"];

interface HeaderField {
	key: string;
	value: string;
	lineNumber: number;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function fail(error: string): { ok: false; error: string } {
	return { ok: false, error };
}

function findBlock(
	lines: string[],
): { start: number; end: number } | { error: string } {
	const start = lines.findIndex((line) => HEADER_START.test(line));
	if (start === -1)
		return { error: "Missing header: add a `// ==Reaction==` block." };

	const relativeEnd = lines
		.slice(start + 1)
		.findIndex((line) => HEADER_END.test(line));
	if (relativeEnd === -1)
		return { error: "Header is not closed: add `// ==/Reaction==`." };

	return { start, end: start + 1 + relativeEnd };
}

function readFields(
	lines: string[],
	firstLineNumber: number,
): Parsed<HeaderField[]> {
	const fields: HeaderField[] = [];
	for (const [index, line] of lines.entries()) {
		const lineNumber = firstLineNumber + index;
		const match = HEADER_LINE.exec(line);
		if (!match)
			return fail(`Line ${lineNumber} inside the header must be a comment.`);

		const [, key, value = ""] = match;
		if (key === undefined) continue;
		if (!KNOWN_FIELDS.includes(key))
			return fail(`Unknown header field @${key} on line ${lineNumber}.`);
		fields.push({ key, value, lineNumber });
	}
	return { ok: true, value: fields };
}

function valuesOf(fields: HeaderField[], key: string): HeaderField[] {
	return fields.filter((field) => field.key === key);
}

function readSingle(fields: HeaderField[], key: string): Parsed<string | null> {
	const [first, second] = valuesOf(fields, key);
	if (second) return fail(`@${key} is set twice (line ${second.lineNumber}).`);
	if (!first) return { ok: true, value: null };
	if (first.value === "")
		return fail(`@${key} on line ${first.lineNumber} has no value.`);
	return { ok: true, value: first.value };
}

function readMatches(fields: HeaderField[]): Parsed<string[]> {
	const matches = valuesOf(fields, "match");
	if (matches.length === 0)
		return fail("Add at least one `@match` pattern, e.g. `*://*/*`.");

	for (const { value, lineNumber } of matches) {
		const isValid = value === "<all_urls>" || MATCH_PATTERN.test(value);
		if (!isValid)
			return fail(
				`@match on line ${lineNumber} is not a valid match pattern: "${value}".`,
			);
	}
	return { ok: true, value: matches.map(({ value }) => value) };
}

function readCamera(fields: HeaderField[]): Parsed<CameraMode> {
	const single = readSingle(fields, "camera");
	if (!single.ok) return single;
	if (single.value === null) return { ok: true, value: "on-demand" };

	const mode = CAMERA_MODES.find((candidate) => candidate === single.value);
	if (!mode)
		return fail(
			`@camera must be one of ${CAMERA_MODES.join(", ")}, got "${single.value}".`,
		);
	return { ok: true, value: mode };
}

function splitList(value: string): string[] {
	return value
		.split(/[\s,]+/)
		.map((item) => item.trim())
		.filter((item) => item !== "");
}

function readGestures(fields: HeaderField[]): Parsed<Gesture[]> {
	const names = valuesOf(fields, "gestures").flatMap(({ value }) =>
		splitList(value),
	);

	const unknown = names.find((name) => !isGesture(name));
	if (unknown !== undefined)
		return fail(
			`Unknown gesture "${unknown}". Available: ${gestures.join(", ")}.`,
		);
	return { ok: true, value: [...new Set(names as Gesture[])] };
}

function readSignals(fields: HeaderField[]): Parsed<SignalName[]> {
	const names = valuesOf(fields, "signals").flatMap(({ value }) =>
		splitList(value),
	);

	const unknown = names.find((name) => !isSignalName(name));
	if (unknown !== undefined)
		return fail(
			`Unknown signal "${unknown}". Available: ${signalNames.join(", ")}.`,
		);
	return { ok: true, value: [...new Set(names as SignalName[])] };
}

function buildHeader(fields: HeaderField[]): ParseHeaderResult {
	const name = readSingle(fields, "name");
	if (!name.ok) return name;
	if (name.value === null) return fail("Add a `@name` to the header.");

	const author = readSingle(fields, "author");
	if (!author.ok) return author;
	const matches = readMatches(fields);
	if (!matches.ok) return matches;
	const camera = readCamera(fields);
	if (!camera.ok) return camera;
	const parsedGestures = readGestures(fields);
	if (!parsedGestures.ok) return parsedGestures;
	const parsedSignals = readSignals(fields);
	if (!parsedSignals.ok) return parsedSignals;

	return {
		ok: true,
		header: {
			name: name.value,
			author: author.value,
			matches: matches.value,
			camera: camera.value,
			gestures: parsedGestures.value,
			signals: parsedSignals.value,
		},
	};
}

/**
 * Reads the `// ==Reaction==` block of a script source without running any of its code.
 * Anything outside the block is ignored.
 */
export function parseHeader(source: string): ParseHeaderResult {
	const lines = source.split(/\r?\n/);
	const block = findBlock(lines);
	if ("error" in block) return fail(block.error);

	const fields = readFields(
		lines.slice(block.start + 1, block.end),
		block.start + 2,
	);
	if (!fields.ok) return fields;
	return buildHeader(fields.value);
}
