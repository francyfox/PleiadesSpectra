import type { ServerMessage, SignalName } from "@repo/protocol";
import type { WorkerInput, WorkerOutput } from "./worker-protocol";

const START_TIMEOUT_MS = 30_000;
const STOP_TIMEOUT_MS = 3_000;
const MAX_FRAMES_IN_FLIGHT = 4;

export interface StreamSession {
	/** Drops the frame when the worker is behind: a late frame is worse than a missing one. */
	sendFrame(frame: { timestampUs: number; pixels: ArrayBuffer }): void;
	/** Starts or stops the `mask` messages of this session. */
	setMask(enabled: boolean): void;
	stop(): Promise<void>;
}

export interface StreamSessionOptions {
	width: number;
	height: number;
	onMessage: (message: ServerMessage) => void;
	/** Also forward the decoded SDK payload as `metrics` messages. */
	debug?: boolean;
	/** Signals to measure and send besides gestures and expression messages. */
	signals?: SignalName[];
}

export type OpenResult =
	| { ok: true; session: StreamSession }
	| { ok: false; message: string; retryable: boolean };

/** The SDK keeps process-global native state: a second session would corrupt the first. */
let isSessionOpen = false;

/** The part of `Worker` the session uses, so tests can stand in for the SDK worker. */
export type SessionWorker = Pick<
	Worker,
	"postMessage" | "terminate" | "onmessage" | "onerror"
>;

export type WorkerFactory = () => SessionWorker;

/** The worker is a TypeScript file next to this one in the source, and a JavaScript file next to the bundle (`scripts/build.ts`). */
const WORKER_EXTENSION = import.meta.url.endsWith(".ts") ? "ts" : "js";

export const createSdkWorker: WorkerFactory = () =>
	new Worker(
		new URL(`./session-worker.${WORKER_EXTENSION}`, import.meta.url).href,
	);

function post(
	worker: SessionWorker,
	input: WorkerInput,
	transfer: Transferable[] = [],
): void {
	worker.postMessage(input, transfer);
}

function isServerMessage(output: WorkerOutput): output is ServerMessage {
	return (
		output.type !== "started" &&
		output.type !== "frame-processed" &&
		output.type !== "stopped"
	);
}

/** Resolves when the worker reports `started`, or with the worker's error. */
function waitUntilStarted(
	worker: SessionWorker,
	forward: (message: ServerMessage) => void,
	debug: boolean,
	signals: SignalName[] | undefined,
): Promise<OpenResult | "started"> {
	return new Promise((resolve) => {
		const timer = setTimeout(
			() =>
				resolve({
					ok: false,
					message: "SmartSpectra did not start in time",
					retryable: true,
				}),
			START_TIMEOUT_MS,
		);
		const finish = (result: OpenResult | "started") => {
			clearTimeout(timer);
			resolve(result);
		};

		worker.onmessage = (event: MessageEvent<WorkerOutput>) => {
			const output = event.data;
			if (output.type === "started") finish("started");
			else if (output.type === "error")
				finish({
					ok: false,
					message: output.message,
					retryable: output.retryable,
				});
			else if (isServerMessage(output)) forward(output);
		};
		worker.onerror = (event) =>
			finish({ ok: false, message: event.message, retryable: true });
		post(worker, { type: "start", debug, signals });
	});
}

function createSession(
	worker: SessionWorker,
	options: StreamSessionOptions,
): StreamSession {
	let framesInFlight = 0;
	let resolveStopped: (() => void) | null = null;

	worker.onmessage = (event: MessageEvent<WorkerOutput>) => {
		const output = event.data;
		if (output.type === "frame-processed")
			framesInFlight = Math.max(0, framesInFlight - 1);
		else if (output.type === "stopped") resolveStopped?.();
		else if (isServerMessage(output)) options.onMessage(output);
	};
	worker.onerror = (event) =>
		options.onMessage({
			type: "error",
			message: event.message,
			retryable: true,
		});

	return {
		sendFrame(frame) {
			if (framesInFlight >= MAX_FRAMES_IN_FLIGHT) return;
			framesInFlight++;
			post(
				worker,
				{
					type: "frame",
					timestampUs: frame.timestampUs,
					width: options.width,
					height: options.height,
					pixels: frame.pixels,
				},
				[frame.pixels],
			);
		},
		setMask(enabled) {
			post(worker, { type: "mask", enabled });
		},
		async stop() {
			const stopped = new Promise<void>((resolve) => {
				resolveStopped = resolve;
				setTimeout(resolve, STOP_TIMEOUT_MS);
			});
			post(worker, { type: "stop" });
			await stopped;
			worker.terminate();
			isSessionOpen = false;
		},
	};
}

export async function openStreamSession(
	options: StreamSessionOptions,
	createWorker: WorkerFactory = createSdkWorker,
): Promise<OpenResult> {
	if (isSessionOpen)
		return {
			ok: false,
			message: "A measurement session is already running",
			retryable: true,
		};

	isSessionOpen = true;
	const worker = createWorker();
	const started = await waitUntilStarted(
		worker,
		options.onMessage,
		options.debug === true,
		options.signals,
	);
	if (started !== "started") {
		worker.terminate();
		isSessionOpen = false;
		return started;
	}
	return { ok: true, session: createSession(worker, options) };
}
