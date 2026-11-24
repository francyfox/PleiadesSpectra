/**
 * Pushes video to the server's `/ws` like the extension does and prints what comes back.
 *
 *   bun scripts/send-video.ts [camera|testsrc|<video file>] [--seconds 15] [--debug] [--signals pulse] [--url ws://localhost:3001/ws]
 */
import {
	FRAME_HEADER_BYTES,
	SERVER_WS_URL,
	type ServerMessage,
} from "@repo/protocol";

const WIDTH = 640;
const HEIGHT = 480;
const FRAME_RATE = 30;
const FRAME_BYTES = WIDTH * HEIGHT * 4;
const DEFAULT_SECONDS = 15;

function argumentValue(flag: string): string | undefined {
	const index = process.argv.indexOf(flag);
	return index === -1 ? undefined : process.argv[index + 1];
}

function ffmpegInputArguments(source: string): string[] {
	if (source === "camera")
		return [
			"-f",
			"v4l2",
			"-framerate",
			String(FRAME_RATE),
			"-video_size",
			`${WIDTH}x${HEIGHT}`,
			"-i",
			"/dev/video0",
		];
	if (source === "testsrc")
		return [
			"-re",
			"-f",
			"lavfi",
			"-i",
			`testsrc2=size=${WIDTH}x${HEIGHT}:rate=${FRAME_RATE}`,
		];
	return ["-re", "-stream_loop", "-1", "-i", source];
}

function startFfmpeg(source: string) {
	return Bun.spawn(
		[
			"ffmpeg",
			"-loglevel",
			"error",
			...ffmpegInputArguments(source),
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

function monotonicUs(): bigint {
	return process.hrtime.bigint() / 1000n;
}

function buildFrameMessage(pixels: Uint8Array): Uint8Array<ArrayBuffer> {
	const message = new Uint8Array(FRAME_HEADER_BYTES + pixels.length);
	new DataView(message.buffer).setBigUint64(0, monotonicUs(), true);
	message.set(pixels, FRAME_HEADER_BYTES);
	return message;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
	const merged = new Uint8Array(a.length + b.length);
	merged.set(a);
	merged.set(b, a.length);
	return merged;
}

function createReport() {
	const counts: Record<string, number> = {};
	const startedAtMs = Date.now();
	let readyAfterMs: number | null = null;
	let lastExpression: unknown = null;

	return {
		record(message: ServerMessage) {
			counts[message.type] = (counts[message.type] ?? 0) + 1;
			const elapsed = ((Date.now() - startedAtMs) / 1000).toFixed(1);
			if (message.type === "ready") readyAfterMs = Date.now() - startedAtMs;
			if (message.type === "expression") {
				lastExpression = message.scores;
				return;
			}
			console.log(`[${elapsed}s]`, JSON.stringify(message));
		},
		print() {
			console.log("--- summary ---");
			console.log("messages by type:", counts);
			console.log("ready after ms:", readyAfterMs);
			console.log("last expression:", lastExpression);
		},
	};
}

async function pumpFrames(
	ffmpeg: ReturnType<typeof startFfmpeg>,
	socket: WebSocket,
	seconds: number,
): Promise<number> {
	const deadlineMs = Date.now() + seconds * 1000;
	let pending: Uint8Array = new Uint8Array(0);
	let sent = 0;

	for await (const chunk of ffmpeg.stdout) {
		pending = concat(pending, chunk);
		while (pending.length >= FRAME_BYTES) {
			socket.send(buildFrameMessage(pending.subarray(0, FRAME_BYTES)));
			pending = pending.slice(FRAME_BYTES);
			sent++;
		}
		if (Date.now() > deadlineMs) break;
	}
	return sent;
}

function waitForOpen(socket: WebSocket): Promise<void> {
	return new Promise((resolve, reject) => {
		socket.onopen = () => resolve();
		socket.onerror = () => reject(new Error("Cannot connect to the server"));
	});
}

async function main() {
	const source =
		process.argv[2] && !process.argv[2].startsWith("--")
			? process.argv[2]
			: "testsrc";
	const seconds = Number(argumentValue("--seconds") ?? DEFAULT_SECONDS);
	const report = createReport();

	const serverUrl = argumentValue("--url") ?? SERVER_WS_URL;
	const socket = new WebSocket(serverUrl);
	socket.onmessage = (event) =>
		report.record(JSON.parse(String(event.data)) as ServerMessage);
	await waitForOpen(socket);

	console.log(
		`source: ${source}, ${seconds}s, ${WIDTH}x${HEIGHT}@${FRAME_RATE}`,
	);
	socket.send(
		JSON.stringify({
			type: "start",
			width: WIDTH,
			height: HEIGHT,
			debug: process.argv.includes("--debug"),
			signals: argumentValue("--signals")?.split(","),
		}),
	);

	const ffmpeg = startFfmpeg(source);
	const sent = await pumpFrames(ffmpeg, socket, seconds);
	ffmpeg.kill();

	socket.send(JSON.stringify({ type: "stop" }));
	await new Promise((resolve) => setTimeout(resolve, 1500));
	socket.close();

	console.log("frames sent:", sent);
	report.print();
}

await main();
process.exit(0);
