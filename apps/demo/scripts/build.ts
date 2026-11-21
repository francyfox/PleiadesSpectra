import { rm } from "node:fs/promises";
import { join } from "node:path";

/** Bundles the demo pages into `dist/index.js`, minified, to run with `bun index.js`: it needs no packages. */
const DEMO_ROOT = join(import.meta.dir, "..");
const DIST = join(DEMO_ROOT, "dist");

await rm(DIST, { recursive: true, force: true });
const result = await Bun.build({
	entrypoints: [join(DEMO_ROOT, "src/index.ts")],
	outdir: DIST,
	target: "bun",
	minify: true,
});
if (!result.success) {
	for (const log of result.logs) console.error(log);
	process.exit(1);
}
console.log(`The demo is in ${DIST}: bun index.js`);
