import { buildReactionTypes } from "./build-types";

const result = await Bun.build({
	entrypoints: ["src/runtime-entry.ts"],
	outdir: "dist",
	naming: "runtime.js",
	format: "iife",
	target: "browser",
});

if (!result.success) {
	for (const log of result.logs) console.error(log);
	process.exit(1);
}

await buildReactionTypes();
