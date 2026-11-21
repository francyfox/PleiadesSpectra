import {
	type DeviceReadinessResult,
	FrameTransform,
	faceMetrics,
	PixelFormat,
	type PixelFormatValue,
	ProcessingStatus,
	type ProcessingStatusValue,
	SmartSpectraErrorCode,
	type SmartSpectraErrorCodeValue,
	SmartSpectraSDK,
	type ValidationCodeValue,
} from "@smartspectra/node-sdk";
import { decodeMetrics } from "@smartspectra/node-sdk/messages";
import { config } from "#modules/config/config";

/**
 * Docs: https://smartspectra.presagetech.com/docs/nodejs/api-reference.md
 */

export interface SpectraFrame {
	data: Uint8Array;
	width: number;
	height: number;
	stride?: number;
	format?: PixelFormatValue;
	timestampUs?: number;
}

export interface SpectraSessionOptions {
	apiKey?: string;
	/** MetricType codes. Defaults to `faceMetrics` (landmarks, blinking, talking, expression). */
	requestedMetrics?: readonly number[];
	onMetrics?: (metrics: SpectraMetrics, timestampUs: number) => void;
	onValidation?: (
		code: ValidationCodeValue,
		hint: string,
		timestampUs: number,
	) => void;
	onStatus?: (status: ProcessingStatusValue) => void;
	/** Called with the checkDeviceReadiness() result before start(). 'blocked' also rejects the session. */
	onReadiness?: (result: DeviceReadinessResult) => void;
	onError?: (error: SpectraError) => void;
}

/** Decoded protobuf payload; shape: https://smartspectra.presagetech.com/docs/data-types.md */
export type SpectraMetrics = ReturnType<typeof decodeMetrics>;

export class SpectraError extends Error {
	constructor(
		readonly code: SmartSpectraErrorCodeValue,
		message: string,
		readonly retryable: boolean,
	) {
		super(message);
		this.name = "SpectraError";
	}
}

export interface SpectraSession {
	readonly status: ProcessingStatusValue;
	/**
	 * Set once `sendFrame` threw (e.g. kTimestampGap after a pause in frames). The SDK does not
	 * recover by itself and the status may still read kRunning: close() and create a new session.
	 */
	readonly failed: SpectraError | null;
	/** Returns false when the frame was not accepted (dropped, not running, or the session failed). */
	sendFrame(frame: SpectraFrame): boolean;
	close(): Promise<void>;
}

interface SessionState {
	isClosed: boolean;
	failure: SpectraError | null;
	lastTimestampUs: number;
}

/** Native SDK state is process-global, so only one session may exist at a time. */
let activeSession: SpectraSession | null = null;
let isSessionBeingCreated = false;

export async function createSpectraSession(
	options: SpectraSessionOptions = {},
): Promise<SpectraSession> {
	if (activeSession || isSessionBeingCreated)
		throw new Error(
			"SmartSpectra session already running (native state is process-global)",
		);

	isSessionBeingCreated = true;
	try {
		return await openSession(options);
	} finally {
		isSessionBeingCreated = false;
	}
}

async function openSession(
	options: SpectraSessionOptions,
): Promise<SpectraSession> {
	const sdk = createSdk(options);
	const state: SessionState = {
		isClosed: false,
		failure: null,
		lastTimestampUs: 0,
	};

	subscribeToSdkEvents(sdk, options, state);
	await startWithReadinessCheck(sdk, options);

	const session = buildSession(sdk, options, state);
	activeSession = session;
	return session;
}

function createSdk(options: SpectraSessionOptions): SmartSpectraSDK {
	return new SmartSpectraSDK({
		apiKey: options.apiKey ?? config.SMARTSPECTRA_API_KEY,
		requestedMetrics: [...(options.requestedMetrics ?? faceMetrics)],
		enableTelemetry: config.SMARTSPECTRA_TELEMETRY,
		enableAccumulatedOutput: false,
	});
}

/** `stopAsync()` emits kInvalidState while shutting down, so errors after close are ignored. */
function subscribeToSdkEvents(
	sdk: SmartSpectraSDK,
	options: SpectraSessionOptions,
	state: SessionState,
): void {
	sdk.on("metrics", (buffer, timestampUs) => {
		options.onMetrics?.(decodeMetrics(buffer), timestampUs);
	});
	sdk.on("validationStatus", (code, timestampUs, hint) =>
		options.onValidation?.(code, hint, timestampUs),
	);
	sdk.on("processingStatus", (status) => options.onStatus?.(status));
	sdk.on("error", (code, message, retryable) => {
		if (state.isClosed) return;
		options.onError?.(new SpectraError(code, message, retryable));
	});
}

async function startWithReadinessCheck(
	sdk: SmartSpectraSDK,
	options: SpectraSessionOptions,
): Promise<void> {
	sdk.useCustomInput(FrameTransform.kNone);
	try {
		await assertDeviceNotBlocked(sdk, options);
		sdk.start();
	} catch (error) {
		void sdk.destroy();
		throw toSpectraError(error);
	}
}

/**
 * Every verdict string is truthy, so the verdict is compared explicitly.
 * Only 'blocked' rejects: 'limited' and 'inconclusive' still start.
 */
async function assertDeviceNotBlocked(
	sdk: SmartSpectraSDK,
	options: SpectraSessionOptions,
): Promise<void> {
	const readiness = await sdk.checkDeviceReadiness();
	options.onReadiness?.(readiness);

	if (readiness.verdict === "blocked")
		throw new SpectraError(
			SmartSpectraErrorCode.kProcessingFailed,
			readiness.reason,
			false,
		);
}

function buildSession(
	sdk: SmartSpectraSDK,
	options: SpectraSessionOptions,
	state: SessionState,
): SpectraSession {
	const session: SpectraSession = {
		get status() {
			return sdk.processingStatus;
		},
		get failed() {
			return state.failure;
		},
		sendFrame: (frame) => sendFrameToSdk(sdk, options, state, frame),
		close: async () => {
			if (state.isClosed) return;
			state.isClosed = true;
			await shutdownSdk(sdk);
			if (activeSession === session) activeSession = null;
		},
	};
	return session;
}

async function shutdownSdk(sdk: SmartSpectraSDK): Promise<void> {
	try {
		await sdk.stopAsync();
	} finally {
		await sdk.destroy();
	}
}

/** The SDK switches kStarting → kRunning only on the first frame, so both statuses accept frames. */
function canAcceptFrames(sdk: SmartSpectraSDK, state: SessionState): boolean {
	if (state.isClosed || state.failure) return false;
	const status = sdk.processingStatus;
	return (
		status === ProcessingStatus.kRunning ||
		status === ProcessingStatus.kStarting
	);
}

/** The SDK throws instead of returning false (kTimestampGap, kInvalidState, ...), so the first throw fails the session. */
function sendFrameToSdk(
	sdk: SmartSpectraSDK,
	options: SpectraSessionOptions,
	state: SessionState,
	frame: SpectraFrame,
): boolean {
	if (!canAcceptFrames(sdk, state)) return false;

	const format = frame.format ?? PixelFormat.kRGBA;
	const stride = frame.stride ?? frame.width * bytesPerPixel(format);
	const timestampUs = nextTimestampUs(state, frame);

	try {
		return sdk.sendFrame(
			frame.data,
			frame.width,
			frame.height,
			stride,
			format,
			timestampUs,
		);
	} catch (error) {
		state.failure = toSpectraError(error);
		options.onError?.(state.failure);
		return false;
	}
}

/** The SDK rejects non-monotonic timestamps (kNonMonotonicTimestamp), so each one is forced above the last. */
function nextTimestampUs(state: SessionState, frame: SpectraFrame): number {
	const timestampUs = Math.max(
		frame.timestampUs ?? monotonicUs(),
		state.lastTimestampUs + 1,
	);
	state.lastTimestampUs = timestampUs;
	return timestampUs;
}

function monotonicUs(): number {
	return Number(process.hrtime.bigint() / 1000n);
}

/** For NV12/NV21 the stride is the Y-plane row width, hence 1 byte. */
function bytesPerPixel(format: PixelFormatValue): number {
	switch (format) {
		case PixelFormat.kRGB:
		case PixelFormat.kBGR:
			return 3;
		case PixelFormat.kRGBA:
		case PixelFormat.kBGRA:
			return 4;
		case PixelFormat.kYUYV:
			return 2;
		default:
			return 1;
	}
}

function toSpectraError(error: unknown): SpectraError {
	if (error instanceof SpectraError) return error;
	const sdkError = error as {
		code?: SmartSpectraErrorCodeValue;
		message?: string;
		retryable?: boolean;
	};
	return new SpectraError(
		sdkError.code ?? SmartSpectraErrorCode.kProcessingFailed,
		sdkError.message ?? String(error),
		sdkError.retryable ?? false,
	);
}
