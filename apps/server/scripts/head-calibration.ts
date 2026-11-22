/**
 * Records a short video of head gestures and runs it through the same code as the server, to tune the thresholds.
 *
 *   bun scripts/head-calibration.ts record [out.mp4]    prompts you to tilt the head, 32 s from the camera
 *   bun scripts/head-calibration.ts analyze [in.mp4]    prints pitch/roll per phase and the gestures that fire
 *
 * Close every page that holds the camera before `record`. The video stays on this machine.
 */
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSpectraSession } from "../src/lib/spectra-sdk";
import {
	createHeadGestureState,
	defaultHeadGestureConfig,
	detectHeadGestures,
} from "../src/modules/gestures/head-gestures";
import { headPoseOf } from "../src/modules/gestures/head-pose";
import {
	addRestPoseSample,
	createRestPoseState,
	poseRelativeTo,
} from "../src/modules/gestures/rest-pose";
import type { HeadPose, Point } from "../src/modules/gestures/types";
import { requestedMetricsFor } from "../src/modules/stream/signal-metrics";

const WIDTH = 640;
const HEIGHT = 480;
const FRAME_RATE = 30;
const FRAME_BYTES = WIDTH * HEIGHT * 4;
const COUNTDOWN_SECONDS = 5;
const DEFAULT_VIDEO = join(tmpdir(), "head-calibration.mp4");

interface Phase {
	name: string;
	fromSeconds: number;
	toSeconds: number;
	prompt: string;
}

const STRAIGHT = "CENTER";

const PHASES: Phase[] = [
	{
		name: "rest",
		fromSeconds: 0,
		toSeconds: 4,
		prompt: "CENTER",
	},
	{
		name: "tilt-down",
		fromSeconds: 4,
		toSeconds: 7,
		prompt: "DOWN",
	},
	{ name: "straight-1", fromSeconds: 7, toSeconds: 10, prompt: STRAIGHT },
	{
		name: "tilt-up",
		fromSeconds: 10,
		toSeconds: 13,
		prompt: "UP",
	},
	{ name: "straight-2", fromSeconds: 13, toSeconds: 16, prompt: STRAIGHT },
	{
		name: "lean-left",
		fromSeconds: 16,
		toSeconds: 19,
		prompt: "LEFT",
	},
	{ name: "straight-3", fromSeconds: 19, toSeconds: 22, prompt: STRAIGHT },
	{
		name: "lean-right",
		fromSeconds: 22,
		toSeconds: 25,
		prompt: "RIGHT",
	},
	{
		name: "natural",
		fromSeconds: 25,
		toSeconds: 32,
		prompt: "FREE (read, lean back)",
	},
];

const TOTAL_SECONDS = PHASES.at(-1)?.toSeconds ?? 0;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function percentile(values: number[], share: number): number {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor((sorted.length - 1) * share)] ?? 0;
}

function round(value: number): number {
	return Math.round(value * 1000) / 1000;
}

const WARNING_LEAD_SECONDS = 2;

async function waitUntil(startedAtMs: number, seconds: number): Promise<void> {
	const waitMs = startedAtMs + seconds * 1000 - Date.now();
	if (waitMs > 0) await sleep(waitMs);
}

/** Warns shortly before each phase and says what to do, for how long, and what comes next. */
async function announcePhases(): Promise<void> {
	const startedAtMs = Date.now();
	for (const [index, phase] of PHASES.entries()) {
		const warningAt = phase.fromSeconds - WARNING_LEAD_SECONDS;
		if (index > 0) {
			await waitUntil(startedAtMs, warningAt);
			console.log(`    next: ${phase.prompt}`);
		}
		await waitUntil(startedAtMs, phase.fromSeconds);
		const duration = phase.toSeconds - phase.fromSeconds;
		console.log(`>>> ${phase.prompt}  (${duration} s)`);
	}
	await waitUntil(startedAtMs, TOTAL_SECONDS);
	console.log("done");
}

async function countdown(): Promise<void> {
	for (let left = COUNTDOWN_SECONDS; left > 0; left--) {
		console.log(`starting in ${left}...`);
		await sleep(1000);
	}
}

function recordingProcess(file: string) {
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
			String(TOTAL_SECONDS),
			"-c:v",
			"libx264",
			"-preset",
			"ultrafast",
			"-crf",
			"16",
			file,
		],
		{ stdout: "inherit", stderr: "inherit" },
	);
}

async function record(file: string): Promise<void> {
	await countdown();
	const ffmpeg = recordingProcess(file);
	await Promise.all([announcePhases(), ffmpeg.exited]);
	console.log(`saved ${file}`);
}

interface PoseSample {
	seconds: number;
	pose: HeadPose;
}

function toPoints(
	landmarks: Array<{ x?: number | null; y?: number | null }>,
): Point[] {
	return landmarks.map((landmark) => ({
		x: landmark.x ?? 0,
		y: landmark.y ?? 0,
	}));
}

function decodingProcess(file: string) {
	return Bun.spawn(
		[
			"ffmpeg",
			"-loglevel",
			"error",
			"-re",
			"-i",
			file,
			"-vf",
			`scale=${WIDTH}:${HEIGHT},fps=${FRAME_RATE}`,
			"-pix_fmt",
			"rgba",
			"-f",
			"rawvideo",
			"-",
		],
		{ stdout: "pipe", stderr: "inherit" },
	);
}

/** Feeds the video to the SDK in real time and collects the head pose of every metrics packet. */
async function collectPoses(file: string): Promise<PoseSample[]> {
	const samples: PoseSample[] = [];
	let firstTimestampUs: number | null = null;
	const session = await createSpectraSession({
		requestedMetrics: requestedMetricsFor([]),
		onMetrics: (metrics, timestampUs) => {
			const landmarks = metrics.face?.landmarks?.at(-1)?.value;
			const pose = landmarks && headPoseOf(toPoints(landmarks));
			if (!pose) return;
			firstTimestampUs ??= timestampUs;
			samples.push({ seconds: (timestampUs - firstTimestampUs) / 1e6, pose });
		},
		onError: (error) => console.error("sdk error:", error.message),
	});

	const ffmpeg = decodingProcess(file);
	let pending = new Uint8Array(0);
	let frameIndex = 0;
	for await (const chunk of ffmpeg.stdout) {
		const merged = new Uint8Array(pending.length + chunk.length);
		merged.set(pending);
		merged.set(chunk, pending.length);
		pending = merged;
		while (pending.length >= FRAME_BYTES) {
			session.sendFrame({
				data: pending.slice(0, FRAME_BYTES),
				width: WIDTH,
				height: HEIGHT,
				timestampUs: Math.round((frameIndex++ * 1e6) / FRAME_RATE),
			});
			pending = pending.slice(FRAME_BYTES);
		}
	}
	await sleep(1500);
	await session.close();
	return samples;
}

interface RelativeSample {
	seconds: number;
	pitch: number;
	roll: number;
}

/** The poses relative to the rest pose, like the server sets it: the median of the first 30 poses. */
function relativeToRest(samples: PoseSample[]): RelativeSample[] {
	let rest = createRestPoseState();
	const relative: RelativeSample[] = [];
	for (const { seconds, pose } of samples) {
		rest = addRestPoseSample(rest, pose);
		if (!rest.restPose) continue;
		const offset = poseRelativeTo(pose, rest.restPose);
		relative.push({ seconds, pitch: offset.pitch, roll: offset.roll });
	}
	return relative;
}

function samplesOf(phase: Phase, samples: RelativeSample[]): RelativeSample[] {
	return samples.filter(
		({ seconds }) => seconds >= phase.fromSeconds && seconds < phase.toSeconds,
	);
}

function printPhaseTable(samples: RelativeSample[]): void {
	console.log(
		"\nphase        pitch p10 / median / p90      roll(rad) p10 / median / p90",
	);
	for (const phase of PHASES) {
		const inPhase = samplesOf(phase, samples);
		const pitches = inPhase.map((sample) => sample.pitch);
		const rolls = inPhase.map((sample) => sample.roll);
		const cells = (values: number[]) =>
			[0.1, 0.5, 0.9]
				.map((share) => round(percentile(values, share)))
				.join(" / ");
		console.log(
			`${phase.name.padEnd(12)} ${cells(pitches).padEnd(28)} ${cells(rolls)}`,
		);
	}
}

function printGestures(samples: RelativeSample[]): void {
	let state = createHeadGestureState();
	console.log("\ngestures with the current config:");
	for (const { seconds, pitch, roll } of samples) {
		const step = detectHeadGestures(
			state,
			{ yaw: 0, pitch, roll },
			seconds * 1000,
			defaultHeadGestureConfig,
		);
		state = step.state;
		for (const event of step.events)
			console.log(
				`  ${seconds.toFixed(1)}s  ${event.gesture}  confidence ${round(event.confidence)}`,
			);
	}
}

function printSuggestions(samples: RelativeSample[]): void {
	const medianOf = (name: string, pick: (sample: RelativeSample) => number) => {
		const phase = PHASES.find((item) => item.name === name);
		return phase ? median(samplesOf(phase, samples).map(pick)) : 0;
	};
	const down = medianOf("tilt-down", (sample) => sample.pitch);
	const up = medianOf("tilt-up", (sample) => sample.pitch);
	const left = medianOf("lean-left", (sample) => sample.roll);
	const right = medianOf("lean-right", (sample) => sample.roll);
	console.log("\nyour real tilts (median over the hold):");
	console.log(
		`  down ${round(down)}   up ${round(up)}   left ${round(left)}   right ${round(right)}`,
	);
	console.log(
		`  config now: tiltOffset ${defaultHeadGestureConfig.tiltOffset}, rollOffset ${defaultHeadGestureConfig.rollOffset}`,
	);
	console.log(
		`  about half of the smaller tilt is a sensible threshold: tiltOffset ~${round(Math.min(Math.abs(down), Math.abs(up)) / 2)}, rollOffset ~${round(Math.min(Math.abs(left), Math.abs(right)) / 2)}`,
	);
}

function toCsv(samples: PoseSample[]): string {
	const rows = samples.map(
		({ seconds, pose }) =>
			`${seconds.toFixed(3)},${pose.yaw},${pose.pitch},${pose.roll}`,
	);
	return ["seconds,yaw,pitch,roll", ...rows].join("\n");
}

async function analyze(file: string): Promise<void> {
	console.log(`analyzing ${file} in real time (${TOTAL_SECONDS} s)...`);
	const rawSamples = await collectPoses(file);
	await Bun.write(`${file}.csv`, toCsv(rawSamples));
	const samples = relativeToRest(rawSamples);
	console.log(`${samples.length} poses after the rest pose was set`);
	printPhaseTable(samples);
	printSuggestions(samples);
	printGestures(samples);
}

const [command, fileArgument] = process.argv.slice(2);
const file = fileArgument ?? DEFAULT_VIDEO;

if (command === "record") await record(file);
else if (command === "analyze") await analyze(file);
else
	console.log("usage: bun scripts/head-calibration.ts record|analyze [file]");
process.exit(0);
