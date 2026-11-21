import type { CameraController } from "../camera/camera-controller";
import type { CameraEvent } from "../camera/camera-events";
import {
	CHECK_MAX_MS,
	CHECK_OWNER,
	type CheckState,
	type CheckView,
	type LogLevel,
	type SpectraLogEntry,
} from "./check.model";
import {
	createIdleCheckState,
	describeEvent,
	expressionsOnly,
	isErrorEvent,
	isSameView,
	reduceCheck,
	toCheckView,
} from "./check.utils";

/** The SDK payload is logged as its expressions; every other answer as the message the server sent. */
function payloadOf(event: CameraEvent): unknown {
	if (event.kind !== "server") return event;
	return event.message.type === "metrics"
		? expressionsOnly(event.message.metrics)
		: event.message;
}

export interface CheckServiceDeps {
	camera: CameraController;
	checkServer(): Promise<boolean>;
	now(): number;
	setTimer(callback: () => void, ms: number): unknown;
	clearTimer(handle: unknown): void;
	publishView(view: CheckView): void;
	publishLog(entry: SpectraLogEntry): void;
}

export interface CheckService {
	/** Turns the camera on and follows what Spectra answers until `stop()` or the time limit. */
	start(): Promise<void>;
	stop(): Promise<void>;
	/** Every camera event goes through here: it is logged, and it moves the check when one runs. */
	handleCameraEvent(event: CameraEvent): void;
	view(): CheckView;
}

/** The “Spectra check” of the popup: camera → server → emotion, with a log of everything that came back. */
export function createCheckService(deps: CheckServiceDeps): CheckService {
	let nextLogId = 1;
	let state: CheckState = createIdleCheckState();
	let limitTimer: unknown = null;

	const writeLog = (
		text: string,
		level: LogLevel = "info",
		payload?: unknown,
	) =>
		deps.publishLog({ id: nextLogId++, at: deps.now(), level, text, payload });

	const apply = (next: CheckState) => {
		const before = toCheckView(state);
		const wasBlocked = state.status === "blocked";
		state = next;
		const after = toCheckView(state);
		if (!isSameView(before, after)) deps.publishView(after);
		if (state.status === "blocked" && !wasBlocked) releaseCamera();
	};

	/** A blocked check must not leave the camera on. */
	const releaseCamera = () => {
		clearLimit();
		void deps.camera.release(CHECK_OWNER).catch(() => {});
	};

	const clearLimit = () => {
		if (limitTimer !== null) deps.clearTimer(limitTimer);
		limitTimer = null;
	};

	const block = (reason: string) => {
		writeLog(`check blocked: ${reason}`, "error");
		apply(reduceCheck(state, { kind: "blocked", reason }, deps.now()));
	};

	/**
	 * What a check logs is what it is about: the emotions, while it runs. Failures are logged always, because a camera
	 * that dies matters to everyone; the traffic of a session that scripts use is not the check's business.
	 */
	const logEvent = (event: CameraEvent) => {
		if (!isRunning() && !isErrorEvent(event)) return;
		const text = describeEvent(event);
		if (!text) return;
		const payload = payloadOf(event);
		writeLog(text, isErrorEvent(event) ? "error" : "info", payload);
	};

	const isRunning = () =>
		state.status === "starting" || state.status === "running";

	return {
		async start() {
			if (isRunning()) return;
			writeLog("check started");
			apply(reduceCheck(state, { kind: "started" }, deps.now()));
			if (!(await deps.checkServer())) return block("Server is offline");
			try {
				await deps.camera.acquire(CHECK_OWNER);
			} catch (error) {
				return block(
					error instanceof Error ? error.message : "Camera is not available",
				);
			}
			limitTimer = deps.setTimer(() => void this.stop(), CHECK_MAX_MS);
		},
		async stop() {
			if (state.status === "idle") return;
			clearLimit();
			await deps.camera.release(CHECK_OWNER).catch(() => {});
			writeLog("check stopped");
			apply(reduceCheck(state, { kind: "stopped" }, deps.now()));
		},
		handleCameraEvent(event) {
			logEvent(event);
			apply(reduceCheck(state, { kind: "camera", event }, deps.now()));
		},
		view: () => toCheckView(state),
	};
}
