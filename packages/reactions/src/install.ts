import { createBaseContext } from "./context";
import type { RuntimeEnvironment } from "./environment";
import { checkGesture, checkSignal } from "./permissions";
import { createPresence, type Presence } from "./presence";
import type { Rule, SignalRule } from "./rules";
import { getSignalStore, watchSignals } from "./signal-store";
import { type ContextWatch, watchContext } from "./staleness";
import {
	type Disposer,
	watchEvent,
	watchGestures,
	watchVisibility,
} from "./triggers";
import type { Handler, ReactionContext, SignalContext } from "./types";

type Fire = (extraContext: object) => void;

function reportFailure(reactionName: string, error: unknown): void {
	console.error(`[reaction "${reactionName}"]`, error);
}

/** Lets a trigger through unless the previous run was less than `cooldownMs` ago. */
function createCooldownGate(
	cooldownMs: number,
	now: () => number,
): () => boolean {
	let lastRunAt = Number.NEGATIVE_INFINITY;
	return () => {
		const currentTime = now();
		if (currentTime - lastRunAt < cooldownMs) return false;
		lastRunAt = currentTime;
		return true;
	};
}

/**
 * The subscriptions of one run of a handler. They live until the page moves on or the element that fired the
 * trigger goes away (the same test that drops an open question), or until `dispose` is called. The page is
 * watched only once the handler subscribes to something.
 */
function createRunScope(
	environment: RuntimeEnvironment,
	element: Element | null,
) {
	const disposers: Disposer[] = [];
	let isDisposed = false;
	let watch: ContextWatch | null = null;

	const dispose = () => {
		if (isDisposed) return;
		isDisposed = true;
		watch?.stop();
		for (const disposeOne of disposers.splice(0)) disposeOne();
	};

	const add = (disposeOne: Disposer) => {
		if (isDisposed) return disposeOne();
		disposers.push(disposeOne);
		if (watch) return;
		watch = watchContext(environment, element);
		watch.changed.then(dispose);
	};

	return { add, dispose };
}

/** Each element keeps one run: when its trigger fires again, the subscriptions of the previous run are dropped. */
function createRunRegistry() {
	const runs = new Map<Element | null, Disposer>();
	return {
		replace(element: Element | null, dispose: Disposer) {
			runs.get(element)?.();
			runs.set(element, dispose);
		},
		disposeAll() {
			for (const dispose of runs.values()) dispose();
			runs.clear();
		},
	};
}

/** Subscriptions made inside a handler are rules of their own, with the limits of the rule that made them. */
function createSubscriptions(
	rule: Rule,
	reactionName: string,
	environment: RuntimeEnvironment,
	presence: Presence,
	scope: ReturnType<typeof createRunScope>,
): Pick<ReactionContext, "onGesture" | "onEvent" | "onSignal"> {
	const limits = {
		cooldownMs: rule.cooldownMs,
		minConfidence: rule.minConfidence,
	};
	const subscribe = (nested: Rule): Disposer => {
		const dispose = installRule(nested, reactionName, environment, presence);
		scope.add(dispose);
		return dispose;
	};
	return {
		onGesture: (gesture, handler) =>
			subscribe({ kind: "gesture", gesture, handler, ...limits }),
		onEvent: (target, type, handler) =>
			subscribe({ kind: "event", target, type, handler, ...limits }),
		onSignal: (signal, handler, options) =>
			subscribe({
				kind: "signal",
				signal,
				minIntervalMs: options?.minIntervalMs ?? 0,
				handler: handler as Handler<SignalContext>,
				...limits,
			}),
	};
}

function createFire(
	rule: Rule,
	reactionName: string,
	environment: RuntimeEnvironment,
	presence: Presence,
	cancel: () => void,
	runs: ReturnType<typeof createRunRegistry>,
): Fire {
	const isAllowed = createCooldownGate(rule.cooldownMs, environment.now);

	return (extraContext) => {
		if (!isAllowed()) return;
		const triggerElement =
			(extraContext as { element?: Element | null }).element ?? null;
		const scope = createRunScope(environment, triggerElement);
		runs.replace(triggerElement, scope.dispose);
		const context = {
			...createBaseContext(
				reactionName,
				environment,
				presence,
				triggerElement,
				cancel,
			),
			...createSubscriptions(rule, reactionName, environment, presence, scope),
			...extraContext,
		};
		Promise.resolve()
			.then(() => (rule.handler as (context: object) => unknown)(context))
			.catch((error) => reportFailure(reactionName, error));
	};
}

/** Starts watching for one rule; the returned function also ends every run that is still subscribed. */
function installRule(
	rule: Rule,
	reactionName: string,
	environment: RuntimeEnvironment,
	presence: Presence,
): Disposer {
	const runs = createRunRegistry();
	const fire = createFire(
		rule,
		reactionName,
		environment,
		presence,
		() => dispose(),
		runs,
	);
	/** Handlers run a microtask after the trigger, so this is set before `cancel()` can be called. */
	let stopWatching: Disposer = () => {};
	const dispose = () => {
		stopWatching();
		runs.disposeAll();
	};
	stopWatching = watchRule(rule, environment, fire);
	return dispose;
}

/** Passes every sample of the wanted signal, at most one per `minIntervalMs`. */
function watchSignalRule(
	rule: SignalRule,
	environment: RuntimeEnvironment,
	fire: Fire,
): Disposer {
	if (!checkSignal(environment, rule.signal)) return () => {};
	const isDue = createCooldownGate(rule.minIntervalMs, environment.now);
	getSignalStore(environment);
	return watchSignals(environment, (sample) => {
		if (sample.signal === rule.signal && isDue()) fire({ sample });
	});
}

function watchRule(
	rule: Rule,
	environment: RuntimeEnvironment,
	fire: Fire,
): Disposer {
	switch (rule.kind) {
		case "visible":
			return watchVisibility(
				rule.selector,
				environment,
				(element) => fire({ element }),
				{ scope: rule.scope },
			);
		case "event":
			return watchEvent(
				rule.target,
				rule.type,
				environment,
				(domEvent, element) => fire({ domEvent, element }),
			);
		case "signal":
			return watchSignalRule(rule, environment, fire);
		case "gesture":
			if (!checkGesture(environment, rule.gesture)) return () => {};
			return watchGestures(environment, (event) => {
				const isWanted =
					event.gesture === rule.gesture &&
					event.confidence >= rule.minConfidence;
				if (isWanted) fire({ event });
			});
	}
}

/** Starts every rule and returns one function that stops them all and takes Beta away if the reaction showed it. */
export function installRules(
	rules: readonly Rule[],
	reactionName: string,
	environment: RuntimeEnvironment,
): Disposer {
	const presence = createPresence(reactionName, environment);
	const disposers = rules.map((rule) =>
		installRule(rule, reactionName, environment, presence),
	);
	return () => {
		for (const dispose of disposers) dispose();
		presence.hide();
	};
}
