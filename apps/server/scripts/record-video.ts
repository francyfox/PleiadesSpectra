/**
 * Records a plain video from the camera, to replay it later with `send-video.ts` (the pulse needs a long,
 * still shot of the face).
 *
 *   bun scripts/record-video.ts [out.mp4] [--seconds 90]
 *
 * Close every page that holds the camera first. The video stays on this machine.
 */
import { tmpdir } from "node:os";
import { join } from "node:path";

const WIDTH = 640;
const HEIGHT = 480;
const FRAME_RATE = 30;
const DEFAULT_SECONDS = 90;
const COUNTDOWN_SECONDS = 5;
const DEFAULT_VIDEO = join(tmpdir(), "pulse-test.mp4");

function argumentValue(flag: string): string | undefined {
	const index = process.argv.indexOf(flag);
	return index === -1 ? undefined : process.argv[index + 1];
}

function outputFile(): string {
	const first = process.argv[2];
	return first && !first.startsWith("--") ? first : DEFAULT_VIDEO;
}

function sleep(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function countdown(): Promise<void> {
	console.log("Look at the camera and stay still.");
	for (let left = COUNTDOWN_SECONDS; left > 0; left--) {
		console.log(`starting in ${left}...`);
		await sleep(1000);
	}
}

/** Almost lossless: strong compression weakens the faint colour changes that carry the pulse. */
function recordingProcess(file: string, seconds: number) {
	return Bun.spawn(
		[
			"ffmpeg",
			"-y",
			"-loglevel",
			"error",
			"-f",
			"v4l2",
			"-framerate",
			String(FRAME_RATE),
			"-video_size",
			`${WIDTH}x${HEIGHT}`,
			"-i",
			"/dev/video0",
			"-t",
			String(seconds),
			"-c:v",
			"libx264",
			"-preset",
			"ultrafast",
			"-crf",
			"8",
			"-pix_fmt",
			"yuv420p",
			file,
		],
		{ stdout: "inherit", stderr: "inherit" },
	);
}

async function main(): Promise<void> {
	const file = outputFile();
	const seconds = Number(argumentValue("--seconds") ?? DEFAULT_SECONDS);
	await countdown();
	console.log(`recording ${seconds} s...`);
	const exitCode = await recordingProcess(file, seconds).exited;
	if (exitCode !== 0) throw new Error(`ffmpeg exited with ${exitCode}`);
	console.log(`saved ${file}`);
}

await main();
