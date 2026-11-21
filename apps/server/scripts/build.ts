import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import serverPackage from "../package.json";

/**
 * Bundles the server into `dist/`, minified, to run with `bun index.js`.
 *
 * The SmartSpectra SDK stays out of the bundle: it loads a native library (`koffi`, `libsmartspectra`) from the
 * package of its platform, which cannot be put into a JavaScript file. `dist/package.json` names it, so that
 * `bun install` in `dist/` brings it (and only it) next to the bundle.
 */
const SERVER_ROOT = join(import.meta.dir, "..");
const DIST = join(SERVER_ROOT, "dist");
const REACTIONS = join(SERVER_ROOT, "../../packages/reactions");
const SDK = "@smartspectra/node-sdk";

/** What `get_script_guide` reads at run time from `@repo/reactions`: the rules, the typings and the examples. */
const GUIDE_FILES = ["prompt.md", "reactions.d.ts", "examples"];

async function bundle(): Promise<void> {
	const result = await Bun.build({
		entrypoints: [
			join(SERVER_ROOT, "src/index.ts"),
			join(SERVER_ROOT, "src/modules/stream/session-worker.ts"),
		],
		outdir: DIST,
		target: "bun",
		minify: true,
		/** The worker sits next to the main file, where `createSdkWorker` looks for it. */
		naming: { entry: "[name].[ext]" },
		external: [SDK, `${SDK}/*`],
	});
	if (result.success) return;
	for (const log of result.logs) console.error(log);
	process.exit(1);
}

/** A package with the guide files only: the real one is a workspace package with a build of its own. */
async function vendorReactionsGuide(): Promise<void> {
	const target = join(DIST, "reactions");
	await mkdir(target, { recursive: true });
	for (const file of GUIDE_FILES)
		await cp(join(REACTIONS, file), join(target, file), { recursive: true });
	await writeFile(
		join(target, "package.json"),
		`${JSON.stringify(
			{
				name: "@repo/reactions",
				version: "0.0.0",
				type: "module",
				exports: {
					"./prompt.md": "./prompt.md",
					"./reactions.d.ts": "./reactions.d.ts",
				},
			},
			null,
			2,
		)}\n`,
	);
}

async function writeRuntimePackage(): Promise<void> {
	const dependencies = serverPackage.dependencies as Record<string, string>;
	const sdkVersion = dependencies[SDK];
	if (!sdkVersion) throw new Error(`${SDK} is missing in package.json`);
	await writeFile(
		join(DIST, "package.json"),
		`${JSON.stringify(
			{
				name: "spectra-server",
				private: true,
				type: "module",
				dependencies: {
					[SDK]: sdkVersion,
					"@repo/reactions": "file:./reactions",
				},
			},
			null,
			2,
		)}\n`,
	);
}

await rm(DIST, { recursive: true, force: true });
await bundle();
await vendorReactionsGuide();
await writeRuntimePackage();
console.log(
	`The server is in ${DIST}: bun install --production, then bun index.js`,
);
