import {
	expressionNames,
	gestures,
	signalNames,
	vitalNames,
	widgetPlaces,
	widgetSizes,
} from "@repo/protocol";

const PACKAGE_ROOT = new URL("../", import.meta.url);
const MAX_ONE_LINE_UNION = 75;
const OUTPUT_FILE = new URL("reactions.d.ts", PACKAGE_ROOT);

const HEADER = `/**
 * Types of the global \`reaction()\` available inside a script file.
 * Add \`// @ts-check\` at the top of a script to get them in your editor.
 *
 * Generated from \`src/types.ts\` by \`scripts/build-types.ts\`; do not edit by hand.
 */`;

/** Names in \`src/types.ts\` that read better inside the \`Reactions\` namespace. */
const RENAMES: Record<string, string> = {
	GestureEventDetail: "GestureEvent",
	ReactionContext: "Context",
	ReactionPlugin: "Script",
};

/** Aliases written as `(typeof list)[number]`: the declaration file spells the union out. */
const LITERAL_UNIONS: Record<string, readonly string[]> = {
	ExpressionName: expressionNames,
	Gesture: gestures,
	SignalName: signalNames,
	VitalName: vitalNames,
	WidgetPlace: widgetPlaces,
	WidgetSizeName: widgetSizes,
};

/** Declarations the script API uses, taken from the protocol package in this order, before those of `types.ts`. */
const PROTOCOL_DECLARATIONS: Array<{ file: string; names: string[] }> = [
	{ file: "../protocol/src/gestures.ts", names: ["Gesture"] },
	{
		file: "../protocol/src/plugin.ts",
		names: ["AskAnswer", "GestureEventDetail", "VitalName"],
	},
	{
		file: "../protocol/src/server-link.ts",
		names: ["ExpressionName", "ExpressionScores"],
	},
	{
		file: "../protocol/src/signals.ts",
		names: ["SignalName", "SignalValues", "SignalSample"],
	},
	{
		file: "../protocol/src/widget-look.ts",
		names: [
			"WidgetPlace",
			"WidgetOffset",
			"WidgetPosition",
			"WidgetSizeName",
			"WidgetSize",
		],
	},
];

interface Declaration {
	name: string;
	/** The comment above the declaration, empty when there is none. */
	doc: string;
	/** The declaration without `export`. */
	body: string;
}

const DECLARATION_START = /^export (?:interface|type) (\w+)/;

async function readLines(relativePath: string): Promise<string[]> {
	return (await Bun.file(new URL(relativePath, PACKAGE_ROOT)).text()).split(
		"\n",
	);
}

/** Braces and parentheses opened minus closed on a line, so a declaration ends where the depth is back to zero. */
function depthChange(line: string): number {
	const opened = line.match(/[{(]/g)?.length ?? 0;
	const closed = line.match(/[})]/g)?.length ?? 0;
	return opened - closed;
}

/** Index of the line where the declaration that starts at `start` ends. */
function endOfDeclaration(lines: string[], start: number): number {
	let depth = 0;
	for (let index = start; index < lines.length; index++) {
		depth += depthChange(lines[index] ?? "");
		const isEnd = /[;}]$/.test(lines[index] ?? "");
		if (depth === 0 && isEnd) return index;
	}
	throw new Error(`Declaration on line ${start + 1} never ends`);
}

/** The `/** ... *\/` block that ends right above `lineIndex`, or an empty string. */
function docAbove(lines: string[], lineIndex: number): string {
	if (!lines[lineIndex - 1]?.trim().endsWith("*/")) return "";
	let start = lineIndex - 1;
	while (start > 0 && !lines[start]?.trim().startsWith("/**")) start--;
	return lines.slice(start, lineIndex).join("\n").trim();
}

/** Every top-level `export interface` and `export type` of a file, with the comment above it. */
function declarationsOf(lines: string[]): Declaration[] {
	const declarations: Declaration[] = [];
	lines.forEach((line, index) => {
		const name = DECLARATION_START.exec(line)?.[1];
		if (!name) return;
		const end = endOfDeclaration(lines, index);
		declarations.push({
			name,
			doc: docAbove(lines, index),
			body: lines
				.slice(index, end + 1)
				.join("\n")
				.replace(/^export\s+/, ""),
		});
	});
	return declarations;
}

function spellOutUnion(declaration: Declaration): Declaration {
	const members = LITERAL_UNIONS[declaration.name];
	if (!members) return declaration;
	const quoted = members.map((member) => JSON.stringify(member));
	const oneLine = `type ${declaration.name} = ${quoted.join(" | ")};`;
	const lines = quoted.map((member) => `\t| ${member}`);
	const multiline = `type ${declaration.name} =\n${lines.join("\n")};`;
	return {
		...declaration,
		body: oneLine.length <= MAX_ONE_LINE_UNION ? oneLine : multiline,
	};
}

function rename(text: string): string {
	return Object.entries(RENAMES).reduce(
		(result, [from, to]) =>
			result.replace(new RegExp(`\\b${from}\\b`, "g"), to),
		text,
	);
}

function render(declaration: Declaration): string {
	const text = [declaration.doc, declaration.body].filter(Boolean).join("\n");
	const renamed = rename(text);
	return renamed
		.split("\n")
		.map((line) => (line ? `\t${line}` : line))
		.join("\n");
}

async function protocolDeclarations(): Promise<Declaration[]> {
	const found: Declaration[] = [];
	for (const { file, names } of PROTOCOL_DECLARATIONS) {
		const declarations = declarationsOf(await readLines(file));
		for (const name of names) {
			const declaration = declarations.find((item) => item.name === name);
			if (!declaration) throw new Error(`${name} is missing in ${file}`);
			found.push(spellOutUnion(declaration));
		}
	}
	return found;
}

/** The comment above `export const reaction` in `src/index.ts` becomes the comment of `declare function reaction`. */
async function reactionDoc(): Promise<string> {
	const lines = await readLines("src/index.ts");
	const index = lines.findIndex((line) =>
		line.startsWith("export const reaction"),
	);
	if (index === -1)
		throw new Error("`reaction` is not exported by src/index.ts");
	return docAbove(lines, index);
}

const REACTION_FUNCTION = `declare function reaction(
	name: string,
	options?: Reactions.ReactionOptions,
): Reactions.Reaction;`;

/** Writes `reactions.d.ts` from `src/types.ts` and the protocol package, so the two cannot drift apart. */
export async function buildReactionTypes(): Promise<void> {
	const own = declarationsOf(await readLines("src/types.ts"));
	const declarations = [...(await protocolDeclarations()), ...own];
	const namespace = [
		"declare namespace Reactions {",
		declarations.map(render).join("\n\n"),
		"}",
	].join("\n");
	const reaction = `${await reactionDoc()}\n${REACTION_FUNCTION}`;
	await Bun.write(OUTPUT_FILE, `${HEADER}\n${namespace}\n\n${reaction}\n`);
}
