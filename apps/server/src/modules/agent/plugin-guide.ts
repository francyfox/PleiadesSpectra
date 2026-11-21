const GUIDE_FILES = [
	{ title: "Rules", specifier: "@repo/reactions/prompt.md", language: "md" },
	{
		title: "reactions.d.ts",
		specifier: "@repo/reactions/reactions.d.ts",
		language: "ts",
	},
] as const;

const EXAMPLE_FILES = ["service-rating.js", "scroll-by-tilt.js"] as const;

async function readText(url: URL): Promise<string> {
	return (await Bun.file(url).text()).trim();
}

function fenced(language: string, text: string): string {
	return `\`\`\`${language}\n${text}\n\`\`\``;
}

async function readExamples(): Promise<string[]> {
	const rulesUrl = new URL(import.meta.resolve(GUIDE_FILES[0].specifier));
	return Promise.all(
		EXAMPLE_FILES.map(async (fileName) => {
			const text = await readText(new URL(`./examples/${fileName}`, rulesUrl));
			return `## Example: ${fileName}\n\n${fenced("js", text)}`;
		}),
	);
}

async function readGuideFiles(): Promise<string[]> {
	return Promise.all(
		GUIDE_FILES.map(async ({ title, specifier, language }) => {
			const text = await readText(new URL(import.meta.resolve(specifier)));
			return language === "md"
				? text
				: `## ${title}\n\n${fenced(language, text)}`;
		}),
	);
}

let guide: Promise<string> | null = null;

/** Rules, typings and examples from `@repo/reactions`, so an agent can write a script on its own. */
export function getPluginGuide(): Promise<string> {
	guide ??= Promise.all([readGuideFiles(), readExamples()]).then(
		([files, examples]) => [...files, ...examples].join("\n\n"),
	);
	return guide;
}
