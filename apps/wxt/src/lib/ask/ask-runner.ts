import type { AskAnswer } from "@repo/protocol";
import type { CameraEvent } from "../camera/camera-events";
import type { WidgetMessage } from "../messages";
import {
	type AskEffect,
	type AskEvent,
	type AskRequest,
	type AskState,
	idleState,
	reduceAsk,
	type TimerName,
} from "./ask-machine";

/** What the runner needs from the outside world; everything is injectable for tests. */
export interface AskDeps {
	checkServer(): Promise<boolean>;
	sendToWidget(tabId: number, message: WidgetMessage): void;
	camera: {
		acquire(owner: string): Promise<void>;
		release(owner: string): Promise<void>;
		isReady(): boolean;
	};
	setTimer(callback: () => void, ms: number): unknown;
	clearTimer(handle: unknown): void;
}

/**
 * How many questions may wait behind the open one. The sixth waiting question is refused at once with "timeout":
 * a page that piles up more has scripts that ask too often, and the user would answer questions for minutes.
 */
export const MAX_WAITING_ASKS = 5;

interface WaitingAsk {
	request: AskRequest;
	tabId: number;
	resolve: (answer: AskAnswer) => void;
}

export interface AskRunner {
	/**
	 * Runs one question; resolves with the gesture, the clicked option, or "timeout". While another question is open
	 * it waits in the shared FIFO queue, and its `timeoutMs` starts only when it is shown.
	 */
	ask(request: AskRequest, tabId: number): Promise<AskAnswer>;
	/** True while a question is open or waits in the queue. */
	isBusy(): boolean;
	cameraOwner(): string | null;
	handleCameraEvent(event: CameraEvent): void;
	answerClicked(value: string): void;
	cameraOffClicked(): void;
	/** The tab closed, navigated or dropped the question: ends the ask if it belongs to that tab. */
	pageGone(tabId: number): void;
}

const CAMERA_PERMISSION_HINT =
	"Camera access is needed: allow it in the tab that just opened";

function eventForCamera(event: CameraEvent): AskEvent | null {
	switch (event.kind) {
		case "lost":
			return { type: "link-failed", message: "Lost connection to the server" };
		case "failed":
			return {
				type: "link-failed",
				message:
					event.reason === "permission"
						? CAMERA_PERMISSION_HINT
						: event.message,
			};
		case "server":
			return eventForServerMessage(event.message);
		case "quality":
			return { type: "validation", hint: event.hint };
	}
}

function eventForServerMessage(
	message: Extract<CameraEvent, { kind: "server" }>["message"],
): AskEvent | null {
	switch (message.type) {
		case "ready":
			return { type: "ready" };
		case "expression":
			return { type: "expression", scores: message.scores };
		case "gesture":
			return { type: "gesture", gesture: message.gesture };
		case "validation":
			return { type: "validation", hint: message.hint };
		case "error":
			return { type: "link-failed", message: message.message };
		case "metrics":
		case "signal":
		case "mask":
			return null;
	}
}

export function createAskRunner(deps: AskDeps): AskRunner {
	let state: AskState = idleState;
	let tabId: number | null = null;
	let resolveAnswer: ((answer: AskAnswer) => void) | null = null;
	let cameraOwner: string | null = null;
	const waiting: WaitingAsk[] = [];
	const timers = new Map<TimerName, unknown>();

	const clearTimers = () => {
		for (const handle of timers.values()) deps.clearTimer(handle);
		timers.clear();
	};

	const setTimer = (timer: TimerName, ms: number) => {
		const previous = timers.get(timer);
		if (previous !== undefined) deps.clearTimer(previous);
		timers.set(
			timer,
			deps.setTimer(() => {
				timers.delete(timer);
				dispatch({ type: "timer-fired", timer });
			}, ms),
		);
	};

	const startCamera = () => {
		const owner = state.request?.pluginName;
		if (!owner) return;
		cameraOwner = owner;
		deps.camera
			.acquire(owner)
			.then(() => {
				if (deps.camera.isReady()) dispatch({ type: "ready" });
			})
			.catch(() =>
				dispatch({
					type: "link-failed",
					message: "Could not start the camera",
				}),
			);
	};

	const stopCamera = () => {
		if (!cameraOwner) return;
		const owner = cameraOwner;
		cameraOwner = null;
		void deps.camera.release(owner).catch(() => {});
	};

	const reply = (answer: AskAnswer) => {
		resolveAnswer?.(answer);
		resolveAnswer = null;
	};

	const runEffect = (effect: AskEffect) => {
		switch (effect.type) {
			case "check-server":
				void deps
					.checkServer()
					.then((online) => dispatch({ type: "server-checked", online }));
				return;
			case "widget":
				if (tabId !== null) deps.sendToWidget(tabId, effect.message);
				return;
			case "start-camera":
				return startCamera();
			case "stop-camera":
				return stopCamera();
			case "set-timer":
				return setTimer(effect.timer, effect.ms);
			case "clear-timers":
				return clearTimers();
			case "reply":
				return reply(effect.answer);
		}
	};

	function dispatch(event: AskEvent): void {
		const wasOpen = state.phase !== "idle";
		const step = reduceAsk(state, event);
		state = step.state;
		for (const effect of step.effects) runEffect(effect);
		if (wasOpen && state.phase === "idle") startNextWaiting();
	}

	function show(next: WaitingAsk): void {
		tabId = next.tabId;
		resolveAnswer = next.resolve;
		dispatch({ type: "ask-requested", request: next.request });
	}

	function startNextWaiting(): void {
		const next = waiting.shift();
		if (next) show(next);
	}

	const dropWaitingOfTab = (goneTabId: number) => {
		const gone = waiting.filter((entry) => entry.tabId === goneTabId);
		const stay = waiting.filter((entry) => entry.tabId !== goneTabId);
		waiting.splice(0, waiting.length, ...stay);
		for (const entry of gone) entry.resolve("timeout");
	};

	return {
		ask(request, senderTabId) {
			return new Promise<AskAnswer>((resolve) => {
				const entry = { request, tabId: senderTabId, resolve };
				if (state.phase === "idle") return show(entry);
				if (waiting.length >= MAX_WAITING_ASKS) return resolve("timeout");
				waiting.push(entry);
			});
		},
		isBusy: () => state.phase !== "idle" || waiting.length > 0,
		cameraOwner: () => cameraOwner,
		handleCameraEvent(event) {
			const askEvent = eventForCamera(event);
			if (askEvent) dispatch(askEvent);
		},
		answerClicked: (value) => dispatch({ type: "option-clicked", value }),
		cameraOffClicked: () => dispatch({ type: "camera-off-clicked" }),
		pageGone(goneTabId) {
			dropWaitingOfTab(goneTabId);
			if (goneTabId === tabId) dispatch({ type: "page-gone" });
		},
	};
}
