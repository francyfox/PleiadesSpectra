import { type AskAnswer, isGesture } from "@repo/protocol";
import type { RuntimeEnvironment } from "./environment";
import { optionFor } from "./gesture-labels";
import { checkGesture } from "./permissions";
import type { Presence } from "./presence";
import { getSignalStore, guardSignalsApi } from "./signal-store";
import { watchContext } from "./staleness";
import type { AskOptions, ReactionContext } from "./types";

/** What every context has; `ctx.onGesture` and `ctx.onEvent` are added by the installer, which owns the subscriptions. */
export type BaseContext = Pick<
	ReactionContext,
	"ask" | "toast" | "cancel" | "signals" | "show" | "hide"
>;

const DEFAULT_ASK_TIMEOUT_MS = 8_000;

/** Warm-up (camera and SDK start) is not part of `timeoutMs`, so the local guard waits longer. */
const WARM_UP_ALLOWANCE_MS = 15_000;

/**
 * Waits for `promise` no longer than `deadlineMs`. If it does not settle in time, or rejects, resolves with
 * `fallback` instead, so the returned promise never rejects and never hangs. The original promise is not
 * cancelled: if it settles after the deadline, its result is ignored.
 *
 * @param promise what to wait for
 * @param deadlineMs how long to wait, in milliseconds
 * @param fallback the value to resolve with on timeout or rejection
 */
function withDeadline<Value>(
	promise: Promise<Value>,
	deadlineMs: number,
	fallback: Value,
): Promise<Value> {
	return new Promise((resolve) => {
		const timerId = setTimeout(() => resolve(fallback), deadlineMs);
		promise
			.then(resolve, () => resolve(fallback))
			.finally(() => clearTimeout(timerId));
	});
}

function toAnswer(response: unknown): AskAnswer {
	return isGesture(response) ? response : "timeout";
}

type Outcome = { isStale: false; answer: unknown } | { isStale: true };

function askBackground(
	pluginName: string,
	environment: RuntimeEnvironment,
	question: string,
	options: AskOptions,
): Promise<unknown> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_ASK_TIMEOUT_MS;
	const response = environment.transport({
		type: "reaction/ask",
		pluginName,
		question,
		options: options.expect.map((gesture) =>
			optionFor(gesture, options.labels),
		),
		timeoutMs,
		position: options.position,
		size: options.size,
	});
	return withDeadline<unknown>(
		response,
		timeoutMs + WARM_UP_ALLOWANCE_MS,
		"timeout",
	);
}

/** `element` is what started the question, when something did; its removal makes the question stale. */
function createAsk(
	pluginName: string,
	environment: RuntimeEnvironment,
	element: Element | null,
) {
	return async (question: string, options: AskOptions): Promise<AskAnswer> => {
		for (const gesture of options.expect) checkGesture(environment, gesture);
		const watch = watchContext(environment, element);
		const answered = askBackground(pluginName, environment, question, options);
		const outcome = await Promise.race<Outcome>([
			answered.then((answer) => ({ isStale: false, answer })),
			watch.changed.then(() => ({ isStale: true })),
		]);
		watch.stop();

		if (!outcome.isStale) return toAnswer(outcome.answer);
		environment
			.transport({ type: "reaction/cancel-ask", pluginName })
			.catch(() => {});
		return "timeout";
	};
}

function createToast(pluginName: string, environment: RuntimeEnvironment) {
	return (text: string): void => {
		environment
			.transport({ type: "reaction/toast", pluginName, text })
			.catch(() => {});
	};
}

export function createBaseContext(
	pluginName: string,
	environment: RuntimeEnvironment,
	presence: Presence,
	triggerElement: Element | null = null,
	cancel: () => void = () => {},
): BaseContext {
	return {
		cancel,
		signals: guardSignalsApi(getSignalStore(environment).api, environment),
		ask: createAsk(pluginName, environment, triggerElement),
		toast: createToast(pluginName, environment),
		show: presence.show,
		hide: presence.hide,
	};
}
