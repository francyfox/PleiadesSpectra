import type { SignalName } from "@repo/protocol";
import type { SpectraMetrics } from "#lib/spectra-sdk";
import { createSpectraSession, type SpectraSession } from "#lib/spectra-sdk";
import {
	createGestureEngineState,
	type GestureEngineState,
	stepGestureEngine,
} from "#modules/gestures/gesture-engine";
import { requestedMetricsFor } from "./signal-metrics";
import {
	createSignalEmitterState,
	type SignalEmitterState,
	stepSignalEmitter,
} from "./signal-samples";
import { signalsFromMetrics } from "./signals";
import type { WorkerInput, WorkerOutput } from "./worker-protocol";

/**
 * SDK worker: `start()` blocks the JS thread for ~2 s and frames arrive 30 times a second,
 * so the SDK lives here and the main thread only moves WebSocket traffic.
 */
const scope = self as unknown as {
	postMessage(message: WorkerOutput): void;
	onmessage: ((event: MessageEvent<WorkerInput>) => void) | null;
};

const EXPRESSION_INTERVAL_MS = 100;
const VALIDATION_OK_CODE = 0;
const RAW_METRICS_INTERVAL_MS = 200;
const MASK_INTERVAL_MS = 67;

let session: SpectraSession | null = null;
let engineState: GestureEngineState = createGestureEngineState();
let isReadySent = false;
let lastExpressionAtMs = 0;
let lastValidationCode: number | null = null;
let isDebug = false;
let signalEmitter: SignalEmitterState = createSignalEmitterState();
let lastRawMetricsAtMs = 0;
let isMaskOn = false;
let lastMaskAtMs = 0;
let frameSize = { width: 0, height: 0 };

function post(message: WorkerOutput): void {
	scope.postMessage(message);
}

function resetSessionState(signals: SignalName[] = []): void {
	signalEmitter = createSignalEmitterState(signals);
	engineState = createGestureEngineState();
	isReadySent = false;
	lastExpressionAtMs = 0;
	lastValidationCode = null;
	lastRawMetricsAtMs = 0;
	isMaskOn = false;
	lastMaskAtMs = 0;
}

/** JSON-safe copy of the payload: 64-bit counters (`Long`, `bigint`) must not break the structured clone. */
function toPlain(metrics: SpectraMetrics): unknown {
	return JSON.parse(
		JSON.stringify(metrics, (_key, value) =>
			typeof value === "bigint" ? value.toString() : value,
		),
	);
}

function postRawMetrics(metrics: SpectraMetrics, nowMs: number): void {
	if (!isDebug || nowMs - lastRawMetricsAtMs < RAW_METRICS_INTERVAL_MS) return;
	lastRawMetricsAtMs = nowMs;
	post({ type: "metrics", metrics: toPlain(metrics) });
}

/** The landmarks as one flat list of whole pixels, `[x0, y0, x1, y1, ...]`: small enough to send 15 times a second. */
function flatPoints(points: Array<{ x: number; y: number }>): number[] {
	return points.flatMap((point) => [Math.round(point.x), Math.round(point.y)]);
}

function postMask(
	landmarks: Array<{ x: number; y: number }> | undefined,
	nowMs: number,
): void {
	if (!isMaskOn || !landmarks || nowMs - lastMaskAtMs < MASK_INTERVAL_MS)
		return;
	lastMaskAtMs = nowMs;
	post({ type: "mask", ...frameSize, points: flatPoints(landmarks) });
}

function handleMetrics(metrics: SpectraMetrics): void {
	const nowMs = Date.now();
	postRawMetrics(metrics, nowMs);
	const signals = signalsFromMetrics(metrics);
	postMask(signals.landmarks, nowMs);

	if (signals.expression) {
		if (!isReadySent) {
			isReadySent = true;
			post({ type: "ready" });
		}
		if (nowMs - lastExpressionAtMs >= EXPRESSION_INTERVAL_MS) {
			lastExpressionAtMs = nowMs;
			post({ type: "expression", scores: signals.expression });
		}
	}

	const step = stepGestureEngine(engineState, signals, nowMs);
	engineState = step.state;
	for (const event of step.events) post({ type: "gesture", ...event });

	const emitted = stepSignalEmitter(signalEmitter, metrics, signals, nowMs);
	signalEmitter = emitted.state;
	for (const sample of emitted.samples) post({ type: "signal", sample });
}

/** The SDK repeats the same validation status every packet; only changes are worth sending. */
function handleValidation(code: number, hint: string): void {
	if (code === lastValidationCode) return;
	lastValidationCode = code;
	if (code === VALIDATION_OK_CODE) return;
	post({ type: "validation", code, hint });
}

async function startSession(
	debug: boolean,
	signals: SignalName[] | undefined,
): Promise<void> {
	resetSessionState(signals);
	isDebug = debug;
	try {
		session = await createSpectraSession({
			requestedMetrics: requestedMetricsFor(signals),
			onMetrics: handleMetrics,
			onValidation: (code, hint) => handleValidation(code, hint),
			onError: (error) =>
				post({
					type: "error",
					message: error.message,
					retryable: error.retryable,
				}),
		});
		post({ type: "started" });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const retryable = (error as { retryable?: boolean }).retryable ?? false;
		post({ type: "error", message, retryable });
	}
}

function sendFrame(input: Extract<WorkerInput, { type: "frame" }>): void {
	frameSize = { width: input.width, height: input.height };
	session?.sendFrame({
		data: new Uint8Array(input.pixels),
		width: input.width,
		height: input.height,
		timestampUs: input.timestampUs,
	});
	post({ type: "frame-processed" });
}

async function stopSession(): Promise<void> {
	const closing = session;
	session = null;
	await closing?.close();
	post({ type: "stopped" });
}

scope.onmessage = (event) => {
	const input = event.data;
	if (input.type === "start")
		void startSession(input.debug === true, input.signals);
	else if (input.type === "frame") sendFrame(input);
	else if (input.type === "mask") isMaskOn = input.enabled;
	else void stopSession();
};
