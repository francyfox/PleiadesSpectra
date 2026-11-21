/**
 * Shows which expression SmartSpectra reports for still photos.
 * Each photo is repeated as a live 30 fps stream until the first `expression` arrives, or gives up after 5 s.
 *
 *   bun scripts/photo-expression.ts <photo>... [--timeout 5] [--signals pulse,breathing]
 *
 * `--signals` asks the SDK for the metrics of those signals as well, like a script with `@signals` does, to see
 * whether the expressions still come.
 *
 * Run it from `apps/server` so `.env` with the API key is picked up.
 */
import { basename } from "node:path";
import { isSignalName, type SignalName } from "@repo/protocol";
import { createSpectraSession, type SpectraMetrics } from "#lib/spectra-sdk";
import { requestedMetricsFor } from "#modules/stream/signal-metrics";

const WIDTH = 640;
const HEIGHT = 480;
const FRAME_RATE = 30;
const FACE_HEIGHT_SHARE = 0.85;
const DEFAULT_TIMEOUT_SECONDS = 5;
const TOP_SCORES_SHOWN = 3;

/** `ExpressionType` from https://smartspectra.presagetech.com/docs/data-types.md */
const EXPRESSION_NAMES = [
	"UNSPECIFIED",
	"ANGRY",
	"CONTEMPT",
	"DISGUST",
	"FEAR",
	"HAPPY",
	"NEUTRAL",
	"SAD",
	"SURPRISE",
];

type Expression = NonNullable<
	NonNullable<SpectraMetrics["face"]>["expression"]
>[number];

interface PhotoResult {
	expression: Expression | null;
	secondsToFirst: number;
}

function argumentValue(flag: string): string | undefined {
	const index = process.argv.indexOf(flag);
	return index === -1 ? undefined : process.argv[index + 1];
}

function requestedSignals(): SignalName[] {
	return (argumentValue("--signals") ?? "").split(",").filter(isSignalName);
}

function photoPaths(): string[] {
	const flagValues = new Set(
		["--timeout", "--signals"]
			.map(argumentValue)
			.filter((value) => value !== undefined),
	);
	return process.argv
		.slice(2)
		.filter((argument) => !argument.startsWith("--"))
		.filter((argument) => !flagValues.has(argument));
}

/** Decodes the photo to one RGBA frame; the face is shrunk and padded with gray so the SDK sees it whole. */
async function decodeFrame(path: string): Promise<Uint8Array> {
	const filter = `scale=-2:${Math.round(HEIGHT * FACE_HEIGHT_SHARE)},pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:gray`;
	const ffmpeg = Bun.spawn(
		[
			"ffmpeg",
			"-loglevel",
			"error",
			"-i",
			path,
			"-vf",
			filter,
			"-frames:v",
			"1",
			"-pix_fmt",
			"rgba",
			"-f",
			"rawvideo",
			"-",
		],
		{ stdout: "pipe" },
	);
	const frame = new Uint8Array(await new Response(ffmpeg.stdout).arrayBuffer());
	if (frame.length !== WIDTH * HEIGHT * 4)
		throw new Error(`ffmpeg could not decode ${path}`);
	return frame;
}

/** Streams the frame in real time until an expression arrives or the timeout passes. */
async function recognizePhoto(
	frame: Uint8Array,
	timeoutSeconds: number,
): Promise<PhotoResult> {
	let expression: Expression | null = null;
	const startedAt = performance.now();
	let secondsToFirst = 0;

	const session = await createSpectraSession({
		requestedMetrics: requestedMetricsFor(requestedSignals()),
		onMetrics: (metrics) => {
			const latest = metrics.face?.expression?.at(-1);
			if (!latest || expression) return;
			expression = latest;
			secondsToFirst = (performance.now() - startedAt) / 1000;
		},
	});

	try {
		for (let index = 0; !expression; index++) {
			const elapsedSeconds = (performance.now() - startedAt) / 1000;
			if (elapsedSeconds > timeoutSeconds) break;
			session.sendFrame({
				data: frame,
				width: WIDTH,
				height: HEIGHT,
				timestampUs: Math.round((index * 1_000_000) / FRAME_RATE),
			});
			const nextFrameAt = startedAt + ((index + 1) * 1000) / FRAME_RATE;
			await Bun.sleep(Math.max(0, nextFrameAt - performance.now()));
		}
	} finally {
		await session.close();
	}
	return { expression, secondsToFirst };
}

function formatScores(expression: Expression): string {
	return (expression.scores ?? [])
		.map((score) => ({
			name: EXPRESSION_NAMES[score.type ?? 0],
			percent: Math.round(score.confidence ?? 0),
		}))
		.sort((first, second) => second.percent - first.percent)
		.slice(0, TOP_SCORES_SHOWN)
		.map((score) => `${score.name} ${score.percent}%`)
		.join(", ");
}

function formatResult(path: string, result: PhotoResult): string {
	const name = basename(path).padEnd(32);
	if (!result.expression) return `${name} no expression`;
	const stable = result.expression.stable ? "stable" : "unstable";
	return `${name} ${formatScores(result.expression)} (${stable}, ${result.secondsToFirst.toFixed(1)} s)`;
}

async function main() {
	const timeoutSeconds = Number(
		argumentValue("--timeout") ?? DEFAULT_TIMEOUT_SECONDS,
	);
	for (const path of photoPaths()) {
		const frame = await decodeFrame(path);
		console.log(
			formatResult(path, await recognizePhoto(frame, timeoutSeconds)),
		);
	}
	process.exit(0);
}

await main();
